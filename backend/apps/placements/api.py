"""Public surface of placements — the only thing other modules may import (MA-11).

Note what is absent: no `set_state`, no model access, no queryset. A module that
cannot reach in cannot corrupt the state machine.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import UUID

from apps.placements import ports, services, state_machine
from apps.placements.models import MentorAssignment, PauseInterval, Placement, State

__all__ = [
    "PlacementWindow", "ActiveMentor",
    "is_active", "state_of", "placement_window", "active_mentor_assignment",
    "date_within_pause", "request_transition", "register_completion_blocker",
    "available_transitions", "blocked_transitions",
]


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
    reasons = ports.blockers_for(placement_id)
    if not reasons:
        return []
    return [{
        "command": "complete",
        "reasons": [{"code": r.code, "details": r.detail} for r in reasons],
    }]
