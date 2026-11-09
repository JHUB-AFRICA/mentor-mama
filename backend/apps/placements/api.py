"""Public surface of placements — the only thing other modules may import (MA-11).

Note what is absent: no `set_state`, no model access, no queryset. A module that
cannot reach in cannot corrupt the state machine.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import UUID

from apps.placements import ports, services, state_machine
from apps.placements.services import AssessmentWriteAuthority
from django.db.models import Count, Q
from django.utils import timezone

from apps.placements.models import MentorAssignment, PauseInterval, Placement, State, StudentAssignment
from apps.identity import api as identity

__all__ = [
    "PlacementWindow", "ActiveMentor", "AssessmentWriteAuthority",
    "is_active", "state_of", "placement_window", "active_mentor_assignment",
    "date_within_pause", "request_transition", "register_completion_blocker", "verify_session_write",
    "verify_assessment_write",
    "available_transitions", "blocked_transitions",
    "assert_access", "dashboard_counts", "interruption_report", "export_rows",
]


def notification_recipients(placement_id: UUID, *, role: str) -> tuple[UUID, ...]:
    """Return current participant IDs for safe lifecycle notifications."""
    model = MentorAssignment if role == "mentor" else StudentAssignment
    field = "mentor_id" if role == "mentor" else "student_id"
    return tuple(model.objects.filter(placement_id=placement_id, ended_at=None).values_list(field, flat=True))


@dataclass(frozen=True)
class PlacementWindow:
    start: date
    end: date


@dataclass(frozen=True)
class ActiveMentor:
    assignment_id: UUID
    mentor_id: UUID


def is_active(placement_id: UUID) -> bool:
    return Placement.objects.filter(id=placement_id, state=State.ACTIVE).exists()


def dashboard_counts(scope) -> dict[str, int]:
    """Return placement lifecycle counts for an already resolved scope."""
    queryset = Placement.objects.all()
    if scope.is_program_admin:
        queryset = queryset.filter(institution__program_id=scope.program_id)
    elif scope.role == "student":
        queryset = queryset.filter(
            student_assignments__student_id=scope.user_id,
            student_assignments__ended_at=None,
        ).distinct()
    elif scope.role == "mentor":
        queryset = queryset.filter(
            mentor_assignments__mentor_id=scope.user_id,
            mentor_assignments__ended_at=None,
        ).distinct()
    elif scope.institution_id:
        queryset = queryset.filter(institution_id=scope.institution_id)
    elif scope.facility_id:
        queryset = queryset.filter(facility_id=scope.facility_id)
    else:
        queryset = queryset.none()
    counts = queryset.aggregate(
        total=Count("id"),
        draft=Count("id", filter=Q(state=State.DRAFT)),
        scheduled=Count("id", filter=Q(state=State.SCHEDULED)),
        awaiting_student=Count("id", filter=Q(state=State.AWAITING_STUDENT)),
        orientation=Count("id", filter=Q(state=State.ORIENTATION)),
        induction=Count("id", filter=Q(state=State.INDUCTION)),
        active=Count("id", filter=Q(state=State.ACTIVE)),
        paused=Count("id", filter=Q(state=State.PAUSED)),
        completed=Count("id", filter=Q(state=State.COMPLETED)),
        archived=Count("id", filter=Q(state=State.ARCHIVED)),
        withdrawn=Count("id", filter=Q(state=State.WITHDRAWN)),
    )
    return {f"placements_{key}": value for key, value in counts.items()}


def export_rows(scope):
    """Public safe placement rows for analytics exports; no child narratives."""
    rows = Placement.objects.select_related("cohort", "cohort__institution", "facility")
    if scope.is_program_admin:
        return rows.filter(institution__program_id=scope.program_id)
    if scope.role == "coordinator":
        return rows.filter(institution_id=scope.institution_id)
    if scope.role == "nurse_manager":
        return rows.filter(facility_id=scope.facility_id)
    return rows.none()


def interruption_report(scope) -> list[dict]:
    """Return scoped pause causes and elapsed days, with no placement narrative."""
    queryset = PauseInterval.objects.select_related(
        "placement__facility", "placement__cohort", "placement__cohort__institution",
    )
    if scope.is_program_admin:
        queryset = queryset.filter(placement__institution__program_id=scope.program_id)
    elif scope.role == "student":
        queryset = queryset.filter(placement__student_assignments__student_id=scope.user_id, placement__student_assignments__ended_at=None)
    elif scope.role == "mentor":
        queryset = queryset.filter(placement__mentor_assignments__mentor_id=scope.user_id, placement__mentor_assignments__ended_at=None)
    elif scope.institution_id:
        queryset = queryset.filter(placement__institution_id=scope.institution_id)
    elif scope.facility_id:
        queryset = queryset.filter(placement__facility_id=scope.facility_id)
    else:
        return []

    today = timezone.localdate()
    grouped: dict[tuple, dict] = {}
    for pause in queryset:
        # Do not keep counting an open pause after the agreed placement window.
        ended = pause.ended_on or min(today, pause.placement.planned_end)
        days = max((ended - pause.started_on).days, 0)
        key = (pause.placement.facility_id, pause.placement.cohort_id, pause.reason)
        row = grouped.setdefault(key, {
            "facility_id": str(pause.placement.facility_id),
            "facility_name": pause.placement.facility.name,
            "cohort_id": str(pause.placement.cohort_id),
            "cohort_name": pause.placement.cohort.name,
            "reason": pause.reason,
            "interruptions": 0,
            "days_interrupted": 0,
        })
        row["interruptions"] += 1
        row["days_interrupted"] += days
    return sorted(grouped.values(), key=lambda row: (-row["days_interrupted"], row["facility_name"], row["cohort_name"], row["reason"]))


def state_of(placement_id: UUID) -> str | None:
    return Placement.objects.filter(id=placement_id).values_list("state", flat=True).first()


def placement_window(placement_id: UUID) -> PlacementWindow | None:
    row = Placement.objects.filter(id=placement_id).values(
        "planned_start", "planned_end", "actual_end"
    ).first()
    if row is None:
        return None
    return PlacementWindow(
        start=row["planned_start"], end=row["actual_end"] or row["planned_end"]
    )


def active_mentor_assignment(placement_id: UUID) -> ActiveMentor | None:
    row = MentorAssignment.objects.filter(placement_id=placement_id, ended_at=None).values(
        "id", "mentor_id"
    ).first()
    return None if row is None else ActiveMentor(assignment_id=row["id"], mentor_id=row["mentor_id"])


def date_within_pause(placement_id: UUID, day: date) -> bool:
    return PauseInterval.objects.filter(
        placement_id=placement_id, started_on__lte=day
    ).filter(ended_on=None).exists() or PauseInterval.objects.filter(
        placement_id=placement_id, started_on__lte=day, ended_on__gt=day
    ).exists()


def verify_session_write(placement_id: UUID, *, actor, session_date: date):
    """Lock the aggregate and return authority for a child session write."""
    return services.verify_session_write(placement_id, actor=actor, session_date=session_date)


def verify_assessment_write(placement_id: UUID, *, actor):
    """Lock placement scope before a child assessment command writes."""
    return services.verify_assessment_write(placement_id, actor=actor)


def request_transition(placement_id: UUID, target: str, *, actor, reason: str | None = None,
                       asserted_by: str | None = None) -> Placement:
    """Request a state change. The guard is re-evaluated under a row lock."""
    return services.transition(
        placement_id, State(target), actor=actor, reason=reason, asserted_by=asserted_by
    )


def register_completion_blocker(blocker) -> None:
    """Called by higher layers from AppConfig.ready() (ADR 0003)."""
    ports.register(blocker)


def available_transitions(placement_id: UUID) -> list[str]:
    state = state_of(placement_id)
    return [] if state is None else [str(t) for t in state_machine.targets_from(state)]


def blocked_transitions(placement_id: UUID) -> list[dict]:
    """Why an otherwise-legal transition is unavailable now (Stage 6 §7.3)."""
    messages = {
        "FinalAssessmentMissing": "Student final assessment is required before completion.",
        "OpenEscalationBlocksCompletion": "Resolve the open safeguarding concern before completion.",
    }
    reasons = ports.blockers_for(placement_id)
    if not reasons:
        return []
    return [{
        "command": "complete",
        "reasons": [
            {
                "code": r.code,
                "details": r.detail,
                "message": messages.get(
                    r.code, "Resolve this completion requirement before continuing."
                ),
            }
            for r in reasons
        ],
    }]


def assert_access(placement_id: UUID, *, actor) -> Placement:
    """Authorize a placement read/write at the aggregate boundary."""
    placement = Placement.objects.filter(id=placement_id).first()
    if placement is None:
        from apps.core.errors import UnauthorizedFacilityAccess
        raise UnauthorizedFacilityAccess()
    identity.require_scope(actor, institution_id=placement.institution_id, facility_id=placement.facility_id)
    if actor.role == "student" and not StudentAssignment.objects.filter(placement_id=placement_id, student_id=actor.id, ended_at=None).exists():
        from apps.core.errors import UnauthorizedFacilityAccess
        raise UnauthorizedFacilityAccess()
    if actor.role == "mentor" and not MentorAssignment.objects.filter(placement_id=placement_id, mentor_id=actor.id, ended_at=None).exists():
        from apps.core.errors import UnauthorizedFacilityAccess
        raise UnauthorizedFacilityAccess()
    return placement
