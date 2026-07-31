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
from apps.mentorship import events
from apps.mentorship.models import Session, SessionTopic
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


def log_session(cmd: LogSession, *, actor) -> Session:
    # 1. authorisation — is this actor the placement's current mentor (WFR-011)
    assignment = placements.active_mentor_assignment(cmd.placement_id)
    if assignment is None or assignment.mentor_id != actor.id:
        raise errors.UnauthorizedFacilityAccess()

    # 2. state (INV-05)
    if not placements.is_active(cmd.placement_id):
        raise errors.PlacementNotActive(state=placements.state_of(cmd.placement_id))

    # 3. window (INV-04)
    window = placements.placement_window(cmd.placement_id)
    if window is None or not (window.start <= cmd.session_date <= window.end):
        raise errors.SessionOutsidePlacementWindow(
            session_date=str(cmd.session_date),
            window=[str(window.start), str(window.end)] if window else None,
        )
    if placements.date_within_pause(cmd.placement_id, cmd.session_date):
        raise errors.SessionOutsidePlacementWindow(reason="date falls inside a pause")

    # 4. payload (WFR-009) — a cross-row rule, so it lives here, not in a constraint
    if not cmd.topics:
        raise errors.SessionValidationFailed(fields={"topics": "at least one topic is required"})

    with transaction.atomic():
        # 5. duplicate (WFR-014) — same placement, mentor and date, within 5 minutes
        recent = Session.objects.filter(
            placement_id=cmd.placement_id,
            mentor_assignment_id=assignment.assignment_id,
            session_date=cmd.session_date,
        ).order_by("-submitted_at").first()
        if recent is not None:
            from django.utils import timezone

            if timezone.now() - recent.submitted_at < DUPLICATE_WINDOW:
                raise errors.DuplicateSession(session_id=str(recent.id))

        session = Session.objects.create(
            placement_id=cmd.placement_id,
            mentor_assignment_id=assignment.assignment_id,
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
        outbox.publish(events.SessionLogged(
            placement_id=cmd.placement_id, session_id=session.id, mentor_id=actor.id
        ))
    return session
