"""Placement commands. All business logic lives here (§2.1 of the rules).

Every command follows the same shape: lock the aggregate, re-check guards under
the lock, write, audit, publish to the outbox. No external I/O inside the
transaction (TX-01).
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.core import audit, errors, outbox
from apps.facilities import api as facilities
from apps.institutions import api as institutions
from apps.placements import events, ports, state_machine
from apps.placements.models import (
    MentorAssignment,
    OCCUPYING_STATES,
    PauseInterval,
    Placement,
    State,
    StudentAssignment,
    TERMINAL_STATES,
    WardAssignment,
)

TABLE = "placements_placement"


# --------------------------------------------------------------------------- commands
@dataclass(frozen=True)
class CreatePlacement:
    cohort_id: UUID
    student_id: UUID
    planned_start: dt.date
    planned_end: dt.date


def create_placement(cmd: CreatePlacement, *, actor) -> Placement:
    institution_id = institutions.institution_id_of_cohort(cmd.cohort_id)
    if institution_id is None:
        raise errors.InvalidTransition("That cohort does not exist.")
    if not institutions.is_enrolled(cmd.cohort_id, cmd.student_id):
        raise errors.PlacementRequiresStudent("That student is not enrolled in this cohort.")

    with transaction.atomic():
        placement = Placement.objects.create(
            cohort_id=cmd.cohort_id,
            institution_id=institution_id,      # derived, never client-supplied (INV-17)
            planned_start=cmd.planned_start,
            planned_end=cmd.planned_end,
            created_by=actor,
        )
        StudentAssignment.objects.create(
            placement=placement,
            student_id=cmd.student_id,
            started_on=cmd.planned_start,
            created_by=actor,
        )
        audit.record(actor=actor, action="placement.create", entity_table=TABLE, entity_id=placement.id)
        outbox.publish(events.PlacementCreated(placement_id=placement.id, cohort_id=cmd.cohort_id))
    return placement


def allocate_ward(placement_id: UUID, ward_id: UUID, *, actor) -> Placement:
    with transaction.atomic():
        placement = _lock(placement_id)
        _reject_terminal(placement)

        ward = facilities.lock_ward(ward_id)          # INV-16: lock before counting
        if ward is None:
            raise errors.UnauthorizedFacilityAccess()
        occupied = WardAssignment.objects.filter(
            ward_id=ward_id, ended_at=None, placement__state__in=OCCUPYING_STATES
        ).count()
        if occupied >= ward.max_students:
            raise errors.WardCapacityExceeded(occupied=occupied, capacity=ward.max_students)

        WardAssignment.objects.create(placement=placement, ward_id=ward_id, created_by=actor)
        placement.facility_id = facilities.facility_id_of_ward(ward_id)   # derived (INV-17)
        placement.save(update_fields=["facility_id", "updated_at"])

        audit.record(actor=actor, action="placement.allocate_ward", entity_table=TABLE, entity_id=placement.id)
        outbox.publish(events.WardAllocated(placement_id=placement.id, ward_id=ward_id))
        _maybe_schedule(placement, actor=actor)
    placement.refresh_from_db()
    return placement


def assign_mentor(placement_id: UUID, mentor_id: UUID, *, actor) -> Placement:
    with transaction.atomic():
        placement = _lock(placement_id)
        _reject_terminal(placement)
        MentorAssignment.objects.create(placement=placement, mentor_id=mentor_id, created_by=actor)
        audit.record(actor=actor, action="placement.assign_mentor", entity_table=TABLE, entity_id=placement.id)
        outbox.publish(events.MentorAssigned(placement_id=placement.id, mentor_id=mentor_id))
        _maybe_schedule(placement, actor=actor)
    placement.refresh_from_db()
    return placement


def reassign_mentor(placement_id: UUID, mentor_id: UUID, *, actor, reason: str = "") -> Placement:
    """Closes the current assignment and opens a new one (POL-005, INV-12).

    Sessions, induction and feedback are untouched: they belong to the placement,
    and the outgoing mentor's entries stay attributed to them (Stage 3.5 §5.3).
    """
    with transaction.atomic():
        placement = _lock(placement_id)
        _reject_terminal(placement)
        current = MentorAssignment.objects.select_for_update().filter(
            placement=placement, ended_at=None
        ).first()
        if current is None:
            raise errors.InvalidTransition("This placement has no mentor to reassign.")
        if current.mentor_id == mentor_id:
            raise errors.MentorAlreadyAssigned()
        previous_mentor_id = current.mentor_id
        current.ended_at = timezone.now()
        current.end_reason = reason or "reassigned"
        current.save(update_fields=["ended_at", "end_reason", "updated_at"])
        MentorAssignment.objects.create(placement=placement, mentor_id=mentor_id, created_by=actor)

        audit.record(
            actor=actor, action="placement.reassign_mentor", entity_table=TABLE, entity_id=placement.id,
            changes={"mentor_id": {"from": str(previous_mentor_id), "to": str(mentor_id)}},
        )
        outbox.publish(events.MentorReassigned(
            placement_id=placement.id, mentor_id=mentor_id, previous_mentor_id=previous_mentor_id
        ))
    placement.refresh_from_db()
    return placement


def transition(placement_id: UUID, target: State, *, actor, reason: str | None = None,
               asserted_by: str | None = None) -> Placement:
    """The only path to a state change (Stage 4 §4.3)."""
    with transaction.atomic():
        placement = _lock(placement_id)
        _reject_terminal(placement)
        rule = state_machine.find(placement.state, target)
        if rule.requires_reason and not (reason or "").strip():
            raise errors.OverrideReasonRequired("A reason is required for this change.")

        if target == State.COMPLETED:
            _check_completion_blockers(placement)
        _apply(placement, target, actor=actor, reason=reason)

        audit.record(
            actor=actor, action=f"placement.transition.{rule.id}", entity_table=TABLE,
            entity_id=placement.id,
            changes={"state": {"from": str(rule.source), "to": str(rule.target)},
                     "asserted_by": asserted_by},
            override_reason=reason if rule.requires_reason else None,
        )
    placement.refresh_from_db()
    return placement


def pause(placement_id: UUID, *, actor, reason: str, note: str | None = None,
          started_on: dt.date | None = None) -> Placement:
    with transaction.atomic():
        placement = _lock(placement_id)
        state_machine.find(placement.state, State.PAUSED)
        PauseInterval.objects.create(
            placement=placement, started_on=started_on or timezone.localdate(),
            reason=reason, reason_note=note, paused_by=actor,
        )
        placement.state = State.PAUSED
        placement.version += 1
        placement.save(update_fields=["state", "version", "updated_at"])
        audit.record(actor=actor, action="placement.pause", entity_table=TABLE, entity_id=placement.id,
                     override_reason=reason)
        outbox.publish(events.PlacementPaused(placement_id=placement.id, reason=reason))
    placement.refresh_from_db()
    return placement


def resume(placement_id: UUID, *, actor, ended_on: dt.date | None = None) -> Placement:
    """POL-020: the pause extends actual_end, so the student keeps their time."""
    with transaction.atomic():
        placement = _lock(placement_id)
        state_machine.find(placement.state, State.ACTIVE)
        interval = PauseInterval.objects.select_for_update().filter(
            placement=placement, ended_on=None
        ).first()
        if interval is None:
            raise errors.InvalidTransition("This placement has no open pause.")
        interval.ended_on = ended_on or timezone.localdate()
        interval.resumed_by = actor
        interval.save(update_fields=["ended_on", "resumed_by", "updated_at"])

        paused_days = (interval.ended_on - interval.started_on).days
        placement.actual_end = (placement.actual_end or placement.planned_end) + dt.timedelta(days=paused_days)
        placement.state = State.ACTIVE
        placement.version += 1
        placement.save(update_fields=["state", "actual_end", "version", "updated_at"])

        audit.record(actor=actor, action="placement.resume", entity_table=TABLE, entity_id=placement.id,
                     changes={"actual_end": {"to": str(placement.actual_end), "paused_days": paused_days}})
        outbox.publish(events.PlacementResumed(placement_id=placement.id))
    placement.refresh_from_db()
    return placement


# --------------------------------------------------------------------------- internals
def _lock(placement_id: UUID) -> Placement:
    placement = Placement.objects.select_for_update().filter(id=placement_id).first()
    if placement is None:
        raise errors.UnauthorizedFacilityAccess()       # 404, never 403 (SEC-03)
    return placement


def _reject_terminal(placement: Placement) -> None:
    if placement.state in TERMINAL_STATES:
        raise errors.PlacementArchived()


def _check_completion_blockers(placement: Placement) -> None:
    """INV-07 / INV-08 via dependency-inverted ports (ADR 0003)."""
    reasons = ports.blockers_for(placement.id)
    if reasons:
        first = reasons[0]
        error = getattr(errors, first.code, errors.InvalidTransition)
        raise error(**(first.detail or {}))


def _apply(placement: Placement, target: State, *, actor, reason: str | None) -> None:
    placement.state = target
    placement.version += 1
    fields = ["state", "version", "updated_at"]

    if target == State.ACTIVE and placement.actual_start is None:
        placement.actual_start = timezone.localdate()
        fields.append("actual_start")
    if target == State.COMPLETED:
        placement.completed_at = timezone.now()
        fields.append("completed_at")
    if target == State.WITHDRAWN:
        placement.withdrawal_reason = reason
        fields.append("withdrawal_reason")
    if target == State.ARCHIVED:
        placement.archived_at = timezone.now()
        fields.append("archived_at")

    placement.save(update_fields=fields)

    event = {
        State.ACTIVE: events.PlacementActivated(placement_id=placement.id),
        State.SCHEDULED: events.PlacementScheduled(placement_id=placement.id),
        State.COMPLETED: events.PlacementCompleted(placement_id=placement.id),
        State.WITHDRAWN: events.PlacementWithdrawn(placement_id=placement.id, reason=reason or ""),
    }.get(target)
    if event is not None:
        outbox.publish(event)


def _maybe_schedule(placement: Placement, *, actor) -> None:
    """T-01 is system-derived (WFR-002).

    The assignment set is completed by two different institutions — the
    Coordinator allocates the ward, the Nurse Manager assigns the mentor — so
    neither may press the other's button. The transition fires when the set is
    complete, whichever side completed it.
    """
    if placement.state != State.DRAFT:
        return
    complete = (
        StudentAssignment.objects.filter(placement=placement, ended_at=None).exists()
        and MentorAssignment.objects.filter(placement=placement, ended_at=None).exists()
        and WardAssignment.objects.filter(placement=placement, ended_at=None).exists()
    )
    if complete:
        _apply(placement, State.SCHEDULED, actor=actor, reason=None)
        audit.record(
            actor=actor, action="placement.transition.T-01", entity_table=TABLE, entity_id=placement.id,
            changes={"state": {"from": "draft", "to": "scheduled"}, "asserted_by": "system_derived"},
        )
