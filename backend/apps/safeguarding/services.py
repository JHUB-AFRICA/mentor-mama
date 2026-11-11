from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.core import audit, errors, outbox
from apps.identity import api as identity
from apps.identity.models import Role, Status, User
from apps.placements import api as placements
from apps.safeguarding import events
from apps.safeguarding.models import Escalation, EscalationState, ReviewRoute
from apps.facilities.models import Facility


@dataclass(frozen=True)
class RaiseConcern:
    placement_id: UUID | None
    facility_id: UUID | None
    category: str
    severity: str
    description: str
    related_escalation_id: UUID | None = None
    routed_to: str = ReviewRoute.BOTH


def _scope_for(row):
    return {"facility_id": str(row.facility_id), "placement_id": str(row.placement_id) if row.placement_id else None}


@transaction.atomic
def raise_concern(cmd: RaiseConcern, *, actor):
    if actor.status != Status.ACTIVE or actor.role not in {Role.STUDENT, Role.MENTOR}:
        raise errors.UnauthorizedFacilityAccess()
    placement = None
    facility_id = cmd.facility_id
    if cmd.placement_id:
        placement = placements.assert_access(cmd.placement_id, actor=actor)
        if facility_id and facility_id != placement.facility_id:
            raise errors.UnauthorizedFacilityAccess()
        facility_id = placement.facility_id
    else:
        # A facility-only concern is available to a mentor only for their own
        # facility. Students must attach a concern to an assigned placement.
        if actor.role != Role.MENTOR or not actor.facility_id or facility_id != actor.facility_id:
            raise errors.UnauthorizedFacilityAccess()
        if not Facility.objects.filter(
            id=facility_id, program_id=actor.program_id, archived_at=None,
        ).exists():
            raise errors.UnauthorizedFacilityAccess()
    if not facility_id:
        raise errors.UnauthorizedFacilityAccess()
    routed_to = cmd.routed_to
    if routed_to not in ReviewRoute.values:
        raise errors.UnauthorizedFacilityAccess()
    if placement is None:
        # No placement means no university coordinator in scope: the facility's nurse manager is the only reviewer.
        routed_to = ReviewRoute.NURSE_MANAGER
    if cmd.related_escalation_id:
        related = Escalation.objects.select_related(
            "placement__cohort__institution", "facility",
        ).filter(id=cmd.related_escalation_id, facility_id=facility_id).first()
        if related is None or not can_read_detail(actor, related):
            raise errors.EscalationAccessDenied()
    row = Escalation.objects.create(
        placement=placement, facility_id=facility_id, submitted_by=actor,
        category=cmd.category.strip(), severity=cmd.severity,
        description=cmd.description.strip(), related_escalation_id=cmd.related_escalation_id,
        routed_to=routed_to,
    )
    audit.record(actor=actor, action="escalation.raise", entity_table="safeguarding_escalation",
                 entity_id=row.id, scope=_scope_for(row), changes={"state": EscalationState.OPEN, "severity": row.severity, "routed_to": row.routed_to})
    recipients = _reviewer_recipients(row, placement)
    outbox.publish(events.EscalationRaised(
        escalation_id=row.id, placement_id=row.placement_id, severity=row.severity,
        recipient_user_ids=tuple(dict.fromkeys(recipients)),
    ))
    return row


def _reviewer_recipients(row, placement) -> list:
    """Only the reviewers the submitter chose are told. High severity no longer widens the audience."""
    recipients = []
    if row.routed_to in {ReviewRoute.NURSE_MANAGER, ReviewRoute.BOTH}:
        recipients.extend(identity.users(
            role=Role.NURSE_MANAGER, status=Status.ACTIVE, facility_id=row.facility_id,
        ).values_list("id", flat=True))
    if placement and row.routed_to in {ReviewRoute.COORDINATOR, ReviewRoute.BOTH}:
        recipients.extend(identity.users(
            role=Role.COORDINATOR, status=Status.ACTIVE, institution_id=placement.institution_id,
        ).values_list("id", flat=True))
    return recipients


def _routed_to_role(row, role) -> bool:
    if role == Role.NURSE_MANAGER:
        return row.routed_to in {ReviewRoute.NURSE_MANAGER, ReviewRoute.BOTH}
    if role == Role.COORDINATOR:
        return row.routed_to in {ReviewRoute.COORDINATOR, ReviewRoute.BOTH}
    return True


def can_review(actor, row) -> bool:
    if actor.status != Status.ACTIVE or actor.role not in {Role.NURSE_MANAGER, Role.COORDINATOR, Role.PROGRAM_ADMIN}:
        return False
    if actor.role == Role.PROGRAM_ADMIN:
        return (row.placement_id and actor.program_id == row.placement.cohort.institution.program_id) or (
            not row.placement_id and actor.program_id == row.facility.program_id
        )
    if not _routed_to_role(row, actor.role):
        return False
    if actor.role == Role.NURSE_MANAGER:
        return actor.program_id == row.facility.program_id and actor.facility_id == row.facility_id
    return (row.placement_id is not None
            and actor.program_id == row.placement.cohort.institution.program_id
            and actor.institution_id == row.placement.cohort.institution_id)


def can_read_detail(actor, row) -> bool:
    if actor.status != Status.ACTIVE:
        return False
    if actor.id == row.submitted_by_id:
        return True
    if actor.role == Role.PROGRAM_ADMIN:
        return can_review(actor, row)
    return row.reviewer_id == actor.id and can_review(actor, row)


def list_for(actor):
    if actor.status != Status.ACTIVE:
        return Escalation.objects.none()
    rows = Escalation.objects.select_related("placement__cohort__institution", "submitted_by", "reviewer").order_by("-created_at")
    if actor.role == Role.PROGRAM_ADMIN:
        rows = rows.filter(placement__cohort__institution__program_id=actor.program_id) | rows.filter(facility__program_id=actor.program_id)
    elif actor.role == Role.NURSE_MANAGER:
        rows = rows.filter(facility_id=actor.facility_id, routed_to__in=[ReviewRoute.NURSE_MANAGER, ReviewRoute.BOTH])
    elif actor.role == Role.COORDINATOR:
        rows = rows.filter(placement__institution_id=actor.institution_id, routed_to__in=[ReviewRoute.COORDINATOR, ReviewRoute.BOTH])
    elif actor.role in {Role.STUDENT, Role.MENTOR}:
        rows = rows.filter(submitted_by=actor)
    else:
        rows = rows.none()
    return rows.distinct()


@transaction.atomic
def assign_reviewer(row_id: UUID, reviewer_id: UUID, *, actor):
    row = Escalation.objects.select_for_update(of=("self",)).select_related("placement__cohort__institution").filter(id=row_id).first()
    reviewer = User.objects.filter(id=reviewer_id, status=Status.ACTIVE).first()
    if not row or not reviewer or not can_review(actor, row) or reviewer.id == row.submitted_by_id:
        raise errors.EscalationAccessDenied()
    # A concern held by one reviewer is not silently taken over; only a programme admin may reassign it.
    if row.reviewer_id and row.reviewer_id != actor.id and actor.role != Role.PROGRAM_ADMIN:
        raise errors.EscalationAccessDenied()
    if reviewer.role not in {Role.NURSE_MANAGER, Role.COORDINATOR, Role.PROGRAM_ADMIN} or reviewer.program_id != actor.program_id:
        raise errors.EscalationAccessDenied()
    if reviewer.role in {Role.NURSE_MANAGER, Role.COORDINATOR} and not _routed_to_role(row, reviewer.role):
        raise errors.EscalationAccessDenied()
    if reviewer.role == Role.NURSE_MANAGER and reviewer.facility_id != row.facility_id:
        raise errors.EscalationAccessDenied()
    if reviewer.role == Role.COORDINATOR and (not row.placement_id or reviewer.institution_id != row.placement.cohort.institution_id):
        raise errors.EscalationAccessDenied()
    row.reviewer = reviewer
    row.state = EscalationState.UNDER_REVIEW
    row.save(update_fields=["reviewer", "state", "updated_at"])
    audit.record(actor=actor, action="escalation.assign_reviewer", entity_table="safeguarding_escalation", entity_id=row.id, changes={"state": row.state, "reviewer_id": str(reviewer.id)})
    outbox.publish(events.EscalationStatusChanged(escalation_id=row.id, state=row.state, recipient_user_ids=(row.submitted_by_id,)))
    return row


def _reviewer_row(row_id, actor):
    row = Escalation.objects.select_for_update(of=("self",)).select_related("placement__cohort__institution").filter(id=row_id).first()
    if not row or row.reviewer_id != actor.id or not can_review(actor, row):
        raise errors.EscalationAccessDenied()
    return row


@transaction.atomic
def record_finding(row_id: UUID, finding: str, *, actor):
    row = _reviewer_row(row_id, actor)
    if row.state != EscalationState.UNDER_REVIEW or not finding.strip():
        raise errors.InvalidEscalationTransition()
    row.finding = finding.strip()
    row.state = EscalationState.ACTION_REQUIRED
    row.save(update_fields=["finding", "state", "updated_at"])
    audit.record(actor=actor, action="escalation.record_finding", entity_table="safeguarding_escalation", entity_id=row.id, changes={"state": row.state})
    outbox.publish(events.EscalationStatusChanged(escalation_id=row.id, state=row.state, recipient_user_ids=(row.submitted_by_id,)))
    return row


@transaction.atomic
def record_action(row_id: UUID, action_taken: str, *, actor, resolution_outcome=None, referral_note=None):
    row = _reviewer_row(row_id, actor)
    if row.state not in {EscalationState.UNDER_REVIEW, EscalationState.ACTION_REQUIRED} or not action_taken.strip():
        raise errors.InvalidEscalationTransition()
    row.action_taken = action_taken.strip()
    row.resolution_outcome = resolution_outcome
    row.referral_note = referral_note
    row.state = EscalationState.RESOLVED
    row.save(update_fields=["action_taken", "resolution_outcome", "referral_note", "state", "updated_at"])
    audit.record(actor=actor, action="escalation.record_action", entity_table="safeguarding_escalation", entity_id=row.id, changes={"state": row.state, "resolution_outcome": resolution_outcome})
    outbox.publish(events.EscalationStatusChanged(escalation_id=row.id, state=row.state, recipient_user_ids=(row.submitted_by_id,)))
    return row


@transaction.atomic
def close(row_id: UUID, closure_date, *, actor):
    row = Escalation.objects.select_for_update(of=("self",)).select_related("placement__cohort__institution").filter(id=row_id).first()
    if not row or row.state != EscalationState.RESOLVED or not row.action_taken or not can_review(actor, row):
        raise errors.InvalidEscalationTransition()
    if row.reviewer_id not in {actor.id, None} and actor.role not in {Role.NURSE_MANAGER, Role.PROGRAM_ADMIN}:
        raise errors.EscalationAccessDenied()
    row.state = EscalationState.CLOSED
    row.closure_date = closure_date
    row.save(update_fields=["state", "closure_date", "updated_at"])
    audit.record(actor=actor, action="escalation.close", entity_table="safeguarding_escalation", entity_id=row.id, changes={"state": row.state, "closure_date": str(closure_date)})
    outbox.publish(events.EscalationStatusChanged(escalation_id=row.id, state=row.state, recipient_user_ids=(row.submitted_by_id,)))
    return row


@transaction.atomic
def request_rereview(row_id: UUID, reason: str, *, actor):
    """The person who raised a concern asks for another look after it was resolved or closed.

    The concern returns to the queue of the same chosen reviewers, with the reason attached. Earlier findings stay
    on the record; the audit trail keeps every round.
    """
    row = Escalation.objects.select_for_update(of=("self",)).select_related("placement__cohort__institution", "facility").filter(id=row_id).first()
    if not row or row.submitted_by_id != actor.id or actor.status != Status.ACTIVE:
        raise errors.EscalationAccessDenied()
    reason = (reason or "").strip()
    if row.state not in {EscalationState.RESOLVED, EscalationState.CLOSED} or len(reason) < 10:
        raise errors.InvalidEscalationTransition()
    row.state = EscalationState.OPEN
    row.reviewer = None
    row.closure_date = None
    row.rereview_reason = reason
    row.rereview_requested_at = timezone.now()
    row.rereview_count += 1
    row.save(update_fields=["state", "reviewer", "closure_date", "rereview_reason", "rereview_requested_at", "rereview_count", "updated_at"])
    audit.record(actor=actor, action="escalation.request_rereview", entity_table="safeguarding_escalation", entity_id=row.id,
                 scope=_scope_for(row), changes={"state": row.state, "rereview_count": row.rereview_count})
    outbox.publish(events.EscalationRaised(
        escalation_id=row.id, placement_id=row.placement_id, severity=row.severity,
        recipient_user_ids=tuple(dict.fromkeys(_reviewer_recipients(row, row.placement))),
    ))
    return row
