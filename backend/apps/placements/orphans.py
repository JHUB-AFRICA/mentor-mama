"""Orphaned placements: an open placement whose current mentor can no longer act (plan §5.1, D10).

Session logging requires the current mentor, so an orphaned Active placement is blocked until someone reassigns it.
"""

from __future__ import annotations

from apps.core import outbox
from apps.identity import api as identity
from apps.placements import events
from apps.placements.models import MentorAssignment, Placement, State

Role = identity.ROLES
Status = identity.STATUSES

#: States in which a mentor is still needed.
NEEDS_MENTOR = [State.SCHEDULED, State.AWAITING_STUDENT, State.ORIENTATION, State.INDUCTION, State.ACTIVE, State.PAUSED]


def orphaned(*, actor, facility_id=None):
    """Placements in the actor's facility whose open mentor assignment points at an inactive account."""
    identity.require_capability(actor, "assign_mentor")
    if actor.role == Role.NURSE_MANAGER:
        facility_id = actor.facility_id
    rows = (
        MentorAssignment.objects.filter(ended_at=None, placement__state__in=NEEDS_MENTOR, placement__cohort__institution__program_id=actor.program_id)
        .exclude(mentor__status=Status.ACTIVE)
        .select_related("mentor", "placement")
    )
    if facility_id:
        rows = rows.filter(placement__facility_id=facility_id)
    elif actor.role != Role.PROGRAM_ADMIN:
        return []
    out = []
    students = dict(
        Placement.objects.filter(id__in=[row.placement_id for row in rows]).values_list("id", "student_assignments__student__first_name")
    )
    for row in rows.order_by("placement__planned_start"):
        placement = row.placement
        out.append({
            "placement_id": str(placement.id),
            "state": placement.state,
            "urgent": placement.state == State.ACTIVE,
            "student_first_name": students.get(placement.id) or "",
            "mentor_name": row.mentor.full_name,
            "mentor_status": row.mentor.status,
            "planned_start": placement.planned_start,
            "planned_end": placement.planned_end,
        })
    return out


def _on_status_changed(user, *, previous: str) -> None:
    """When a mentor stops being active, tell the facility's nurse managers how many placements need a new mentor."""
    if user.role != Role.MENTOR or user.status == Status.ACTIVE:
        return
    open_rows = MentorAssignment.objects.filter(mentor=user, ended_at=None, placement__state__in=NEEDS_MENTOR)
    by_facility: dict = {}
    for facility_id, state in open_rows.values_list("placement__facility_id", "placement__state"):
        total, active = by_facility.get(facility_id, (0, 0))
        by_facility[facility_id] = (total + 1, active + (state == State.ACTIVE))
    for facility_id, (total, active) in by_facility.items():
        managers = tuple(identity.users(role=Role.NURSE_MANAGER, status=Status.ACTIVE, facility_id=facility_id).values_list("id", flat=True))
        if managers:
            outbox.publish(events.MentorUnavailableForPlacements(
                facility_id=facility_id, count=total, active_count=active, recipient_user_ids=managers,
            ))
