"""The placement transition table (Stage 3 §5.2).

This module is the only place a placement's state changes. Everything else
requests a transition through `api.request_transition`, which evaluates the
guard under a row lock (DB-03, WFR-028).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from apps.core import errors
from apps.placements.models import State

Guard = Callable[..., None]


@dataclass(frozen=True)
class Transition:
    id: str
    source: State
    target: State
    #: True when the system derives the transition rather than an actor pressing
    #: a button (WFR-002) — e.g. T-01 completes when two institutions have each
    #: done their part, and neither may press the other's button.
    system_derived: bool = False
    requires_reason: bool = False


TRANSITIONS: tuple[Transition, ...] = (
    Transition("T-01", State.DRAFT, State.SCHEDULED, system_derived=True),
    Transition("T-02", State.DRAFT, State.WITHDRAWN, requires_reason=True),
    Transition("T-03", State.SCHEDULED, State.AWAITING_STUDENT),
    Transition("T-04", State.SCHEDULED, State.DRAFT),
    Transition("T-05", State.SCHEDULED, State.WITHDRAWN, requires_reason=True),
    Transition("T-06", State.AWAITING_STUDENT, State.ORIENTATION, system_derived=True),
    Transition("T-07", State.AWAITING_STUDENT, State.WITHDRAWN, requires_reason=True),
    Transition("T-08", State.ORIENTATION, State.INDUCTION),
    Transition("T-09", State.ORIENTATION, State.WITHDRAWN, requires_reason=True),
    Transition("T-10", State.INDUCTION, State.ACTIVE, system_derived=True),
    Transition("T-11", State.INDUCTION, State.WITHDRAWN, requires_reason=True),
    Transition("T-12", State.ACTIVE, State.PAUSED, requires_reason=True),
    Transition("T-13", State.ACTIVE, State.COMPLETED),
    Transition("T-14", State.ACTIVE, State.WITHDRAWN, requires_reason=True),
    Transition("T-15", State.PAUSED, State.ACTIVE),
    Transition("T-16", State.PAUSED, State.WITHDRAWN, requires_reason=True),
    Transition("T-17", State.COMPLETED, State.ARCHIVED, system_derived=True),
)

_BY_EDGE = {(t.source, t.target): t for t in TRANSITIONS}


def find(source: State, target: State) -> Transition:
    """A transition absent from the table does not exist (WFR: InvalidTransition)."""
    transition = _BY_EDGE.get((State(source), State(target)))
    if transition is None:
        raise errors.InvalidTransition(
            f"Cannot move a placement from {source} to {target}.",
            source=str(source),
            target=str(target),
        )
    return transition


def targets_from(source: State) -> list[State]:
    return [t.target for t in TRANSITIONS if t.source == State(source)]
