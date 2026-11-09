"""Session logging — the highest-frequency write, and the offline path.

Guard order is the specification (Stage 3.5 §2.2): authorisation, then state,
then window, then payload, then duplicate. Checking integrity before
authorisation leaks information through error messages.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from uuid import UUID

from django.db import transaction

from apps.core import audit, errors, outbox
from apps.identity import api as identity
from apps.mentorship import events
from apps.mentorship.models import Session, SessionBatch, SessionBatchResult, SessionTopic, SessionType
from apps.placements import api as placements

TABLE = "mentorship_session"
DUPLICATE_WINDOW = dt.timedelta(minutes=5)


@dataclass(frozen=True)
class LogSession:
    placement_id: UUID
    session_date: dt.date
    session_type: str
    topics: tuple[str, ...] = field(default_factory=tuple)
    duration_minutes: int | None = None
    what_was_covered: str | None = None
    feedback_given: str | None = None
    follow_up_action: str = ""


@dataclass(frozen=True)
class LogSessionBatch:
    placement_ids: tuple[UUID, ...]
    session_date: dt.date
    session_type: str
    topics: tuple[str, ...] = field(default_factory=tuple)
    duration_minutes: int | None = None
    what_was_covered: str | None = None
    feedback_given: str | None = None
    follow_up_action: str = ""


def log_session(cmd: LogSession, *, actor) -> Session:
    # Payload is checked before locking; it contains no record information.
    if not cmd.topics:
        raise errors.SessionValidationFailed(fields={"topics": "at least one topic is required"})
    if cmd.session_type not in SessionType.values:
        raise errors.SessionValidationFailed(fields={"session_type": "choose a valid session type"})
    if not cmd.what_was_covered or not cmd.what_was_covered.strip():
        raise errors.SessionValidationFailed(fields={"what_was_covered": "what was covered is required"})

    with transaction.atomic():
        # Authorisation, assignment, state and window are re-checked under the
        # aggregate lock.  A pause/reassignment cannot slip between check/write.
        authority = placements.verify_session_write(
            cmd.placement_id, actor=actor, session_date=cmd.session_date
        )
        # WFR-014 — same placement, mentor and date, within five minutes.
        recent = Session.objects.filter(
            placement_id=cmd.placement_id,
            mentor_assignment_id=authority.mentor_assignment_id,
            session_date=cmd.session_date,
        ).order_by("-submitted_at").first()
        if recent is not None:
            from django.utils import timezone

            if timezone.now() - recent.submitted_at < DUPLICATE_WINDOW:
                raise errors.DuplicateSession(session_id=str(recent.id))

        session = Session.objects.create(
            placement_id=cmd.placement_id,
            mentor_assignment_id=authority.mentor_assignment_id,
            session_date=cmd.session_date,
            session_type=cmd.session_type,
            duration_minutes=cmd.duration_minutes,
            what_was_covered=cmd.what_was_covered,
            feedback_given=cmd.feedback_given,
            follow_up_action=cmd.follow_up_action,
            created_by=actor,
        )
        SessionTopic.objects.bulk_create(
            [SessionTopic(session=session, topic=t) for t in dict.fromkeys(cmd.topics)]
        )
        audit.record(actor=actor, action="session.log", entity_table=TABLE, entity_id=session.id)
        recipients = ()
        if cmd.follow_up_action == "supervisor_follow_up":
            placement = placements.assert_access(cmd.placement_id, actor=actor)
            recipients = tuple(identity.users(
                role=identity.ROLES.NURSE_MANAGER, status=identity.STATUSES.ACTIVE,
                facility_id=placement.facility_id,
            ).values_list("id", flat=True))
        outbox.publish(events.SessionLogged(
            placement_id=cmd.placement_id, session_id=session.id, mentor_id=actor.id,
            follow_up_action=cmd.follow_up_action, recipient_user_ids=recipients,
        ))
    return session


@transaction.atomic
def log_session_batch(cmd: LogSessionBatch, *, actor) -> tuple[SessionBatch, list[SessionBatchResult]]:
    """Atomically copy one shared session into each selected placement history."""
    if not cmd.topics:
        raise errors.SessionValidationFailed(fields={"topics": "at least one topic is required"})
    if cmd.session_type not in SessionType.values:
        raise errors.SessionValidationFailed(fields={"session_type": "choose a valid session type"})
    if not cmd.what_was_covered or not cmd.what_was_covered.strip():
        raise errors.SessionValidationFailed(fields={"what_was_covered": "what was covered is required"})
    if not cmd.placement_ids or len(cmd.placement_ids) > 100:
        raise errors.SessionValidationFailed(fields={"placement_ids": "choose between 1 and 100 students"})
    if len(set(cmd.placement_ids)) != len(cmd.placement_ids):
        raise errors.SessionValidationFailed(fields={"placement_ids": "each student may be selected once"})

    # Acquire aggregate locks in a stable order. Every selected record is
    # authorized and checked before the batch or any session row is written.
    authorities = {}
    for placement_id in sorted(cmd.placement_ids, key=str):
        authorities[placement_id] = placements.verify_session_write(
            placement_id, actor=actor, session_date=cmd.session_date
        )

    batch = SessionBatch.objects.create(created_by=actor)
    results: list[SessionBatchResult] = []
    for placement_id in cmd.placement_ids:
        authority = authorities[placement_id]
        recent = Session.objects.filter(
            placement_id=placement_id,
            mentor_assignment_id=authority.mentor_assignment_id,
            session_date=cmd.session_date,
        ).order_by("-submitted_at").first()
        if recent is not None:
            from django.utils import timezone

            if timezone.now() - recent.submitted_at < DUPLICATE_WINDOW:
                results.append(SessionBatchResult.objects.create(
                    batch=batch, session=recent, placement_id=placement_id, duplicate=True,
                ))
                continue

        session = Session.objects.create(
            placement_id=placement_id,
            batch=batch,
            mentor_assignment_id=authority.mentor_assignment_id,
            session_date=cmd.session_date,
            session_type=cmd.session_type,
            duration_minutes=cmd.duration_minutes,
            what_was_covered=cmd.what_was_covered,
            feedback_given=cmd.feedback_given,
            follow_up_action=cmd.follow_up_action,
            created_by=actor,
        )
        SessionTopic.objects.bulk_create(
            [SessionTopic(session=session, topic=topic) for topic in dict.fromkeys(cmd.topics)]
        )
        results.append(SessionBatchResult.objects.create(
            batch=batch, session=session, placement_id=placement_id, duplicate=False,
        ))
        audit.record(actor=actor, action="session.log", entity_table=TABLE, entity_id=session.id,
                     changes={"batch_id": str(batch.id)})
        recipients = ()
        if cmd.follow_up_action == "supervisor_follow_up":
            placement = placements.assert_access(placement_id, actor=actor)
            recipients = tuple(identity.users(
                role=identity.ROLES.NURSE_MANAGER, status=identity.STATUSES.ACTIVE,
                facility_id=placement.facility_id,
            ).values_list("id", flat=True))
        outbox.publish(events.SessionLogged(
            placement_id=placement_id, session_id=session.id, mentor_id=actor.id,
            follow_up_action=cmd.follow_up_action, recipient_user_ids=recipients,
        ))

    audit.record(actor=actor, action="session.batch_log", entity_table="mentorship_session_batch",
                 entity_id=batch.id, changes={"selected_count": len(results)})
    return batch, results
