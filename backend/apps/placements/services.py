"""Placement commands. All business logic lives here (§2.1 of the rules).

Every command follows the same shape: lock the aggregate, re-check guards under
the lock, write, audit, publish to the outbox. No external I/O inside the
transaction (TX-01).
"""

from __future__ import annotations

import contextlib
import contextvars
import datetime as dt
from dataclasses import dataclass
from uuid import UUID

from django.core.paginator import Paginator
from django.db import models, transaction
from django.utils import timezone

from apps.core import audit, errors, outbox
from apps.facilities import api as facilities
from apps.identity import api as identity
from apps.institutions import api as institutions
from apps.placements import events, ports, state_machine
from apps.placements.models import (
    MentorAssignment,
    OCCUPYING_STATES,
    PauseInterval,
    Placement,
    PlacementAcknowledgement,
    State,
    StudentAssignment,
    TERMINAL_STATES,
    PauseReason,
    WithdrawalReason,
    WardAssignment,
)

TABLE = "placements_placement"
PLACEMENT_IN_PROGRESS_STATES = [state for state in State.values if state not in TERMINAL_STATES and state != State.COMPLETED]


def _institution_scope(actor, institution_id):
    return {"program_id": str(actor.program_id), "institution_id": str(institution_id)}


def _facility_scope(placement):
    return {
        "program_id": str(placement.institution.program_id),
        "institution_id": str(placement.institution_id),
        "facility_id": str(placement.facility_id),
    }

# A state transition is a command, not a generic write.  Keep its authority
# here beside the aggregate owner; identity owns the role-to-capability map.
TRANSITION_CAPABILITIES = {
    "T-02": "withdraw_placement",
    "T-03": "release_placement",
    "T-04": "create_placement",
    "T-05": "withdraw_placement",
    "T-07": "withdraw_placement",
    "T-08": "open_induction",
    "T-09": "withdraw_placement",
    "T-11": "withdraw_placement",
    "T-13": "complete_placement",
    "T-14": "withdraw_placement",
    "T-16": "withdraw_placement",
}
SYSTEM_TRANSITION_CAPABILITIES = {
    "T-06": ("student.confirm_placement", "confirm_placement"),
    "T-10": ("induction.sign_induction", "activate_placement"),
    "T-17": ("programme_admin.archive_placement", "archive_placement"),
}
# These are owned by specialised services because they must also create or
# close a PauseInterval; generic state changes would bypass that invariant.
SPECIALISED_TRANSITIONS = {"T-12", "T-15"}


@dataclass(frozen=True)
class SessionWriteAuthority:
    """A locked, re-checked authority for one session write.

    Returned as data rather than an ORM object so mentorship remains unable to
    write the placement aggregate directly (MA-11).
    """

    mentor_assignment_id: UUID


@dataclass(frozen=True)
class AssessmentWriteAuthority:
    """Locked placement facts needed by the assessments module."""

    placement_id: UUID
    effective_end: dt.date
    state: str


# --------------------------------------------------------------------------- commands
@dataclass(frozen=True)
class CreatePlacement:
    cohort_id: UUID
    student_id: UUID
    planned_start: dt.date
    planned_end: dt.date


@dataclass(frozen=True)
class BulkCreatePlacements:
    cohort_id: UUID
    student_ids: list[UUID]
    planned_start: dt.date
    planned_end: dt.date
    all_eligible: bool = False


def placement_eligible_students(*, actor, cohort_id: UUID, planned_start=None, planned_end=None, page=1, page_size=25, search="") -> dict:
    """Return cohort students split by placement eligibility for the actor's institution."""
    identity.require_capability(actor, "create_placement")
    institution_id = institutions.institution_id_of_cohort(cohort_id)
    if institution_id is None:
        raise errors.InvalidTransition("That cohort does not exist.")
    identity.require_scope(actor, institution_id=institution_id)
    students = institutions.cohort_students(
        cohort_id=cohort_id, program_id=actor.program_id, institution_id=institution_id
    )
    existing_query = StudentAssignment.objects.filter(
        student_id__in=students.values_list("id", flat=True),
        placement__state__in=PLACEMENT_IN_PROGRESS_STATES,
    )
    if planned_start and planned_end:
        existing_query = existing_query.filter(
            placement__planned_start__lt=planned_end,
            placement__planned_end__gt=planned_start,
        )
    existing = {
        row["student_id"]: row
        for row in existing_query.values(
            "student_id", "placement__id", "placement__planned_start", "placement__planned_end"
        )
    }
    eligible, excluded = [], []
    for student in students:
        item = {"id": str(student.id), "name": student.full_name, "email": student.email,
                "registration_number": student.registration_number}
        current = existing.get(student.id)
        if current:
            excluded.append({**item, "reason": "overlapping_placement", "placement_id": str(current["placement__id"]),
                             "dates": f"{current['placement__planned_start']} → {current['placement__planned_end']}"})
        else:
            eligible.append(item)
    if search.strip():
        term = search.strip().lower()
        eligible = [item for item in eligible if term in item["name"].lower() or term in item["email"].lower() or term in (item["registration_number"] or "").lower()]
        excluded = [item for item in excluded if term in item["name"].lower() or term in item["email"].lower() or term in (item["registration_number"] or "").lower()]
    paginator = Paginator(eligible, min(max(page_size, 1), 100))
    current = paginator.get_page(page)
    return {"eligible": list(current.object_list), "excluded": excluded[:100], "pagination": {
        "page": current.number, "page_size": paginator.per_page, "total_count": paginator.count,
        "total_pages": paginator.num_pages, "has_next": current.has_next(), "has_previous": current.has_previous(),
    }}


def create_placement(cmd: CreatePlacement, *, actor) -> Placement:
    identity.require_capability(actor, "create_placement")
    institution_id = institutions.institution_id_of_cohort(cmd.cohort_id)
    if institution_id is None:
        raise errors.InvalidTransition("That cohort does not exist.")
    if not institutions.is_enrolled(cmd.cohort_id, cmd.student_id):
        raise errors.PlacementRequiresStudent("That student is not enrolled in this cohort.")
    identity.require_scope(actor, institution_id=institution_id)

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
        audit.record(actor=actor, action="placement.create", entity_table=TABLE, entity_id=placement.id,
                     scope=_institution_scope(actor, institution_id))
        outbox.publish(events.PlacementCreated(placement_id=placement.id, cohort_id=cmd.cohort_id))
    return placement


def bulk_create_placements(cmd: BulkCreatePlacements, *, actor) -> dict:
    """Create one institution handoff for each eligible student in a cohort.

    Eligibility is evaluated again under the transaction. Existing overlapping
    placements are reported as skips so a large cohort can be processed with
    useful partial results instead of forcing the coordinator to retry rows.
    """
    identity.require_capability(actor, "create_placement")
    institution_id = institutions.institution_id_of_cohort(cmd.cohort_id)
    if institution_id is None:
        raise errors.InvalidTransition("That cohort does not exist.")
    identity.require_scope(actor, institution_id=institution_id)

    candidate_ids = cmd.student_ids
    if getattr(cmd, "all_eligible", False):
        candidate_ids = list(institutions.cohort_students(
            cohort_id=cmd.cohort_id, program_id=actor.program_id, institution_id=institution_id
        ).values_list("id", flat=True))
    enrolled = set(
        institutions.cohort_students(
            cohort_id=cmd.cohort_id,
            program_id=actor.program_id,
            institution_id=institution_id,
        ).filter(id__in=candidate_ids).values_list("id", flat=True)
    )
    existing = set(
        StudentAssignment.objects.filter(
            student_id__in=candidate_ids,
            placement__state__in=PLACEMENT_IN_PROGRESS_STATES,
        ).values_list("student_id", flat=True)
    )
    skipped = []
    for student_id in candidate_ids:
        if student_id not in enrolled:
            skipped.append({"student_id": str(student_id), "reason": "not_enrolled"})
        elif student_id in existing:
            skipped.append({"student_id": str(student_id), "reason": "overlapping_placement"})

    eligible = [student_id for student_id in candidate_ids if student_id in enrolled and student_id not in existing]
    created = []
    with transaction.atomic():
        for student_id in eligible:
            placement = Placement.objects.create(
                cohort_id=cmd.cohort_id,
                institution_id=institution_id,
                planned_start=cmd.planned_start,
                planned_end=cmd.planned_end,
                created_by=actor,
            )
            StudentAssignment.objects.create(
                placement=placement,
                student_id=student_id,
                started_on=cmd.planned_start,
                created_by=actor,
            )
            audit.record(actor=actor, action="placement.create", entity_table=TABLE, entity_id=placement.id,
                         scope=_institution_scope(actor, institution_id))
            outbox.publish(events.PlacementCreated(placement_id=placement.id, cohort_id=cmd.cohort_id))
            created.append(placement)
    return {"created": created, "skipped": skipped}


def allocate_ward(placement_id: UUID, ward_id: UUID, *, actor) -> Placement:
    identity.require_capability(actor, "allocate_ward")
    with transaction.atomic():
        placement = _lock(placement_id)
        _reject_closed(placement)

        ward = facilities.lock_ward(ward_id)          # INV-16: lock before counting
        if ward is None:
            raise errors.UnauthorizedFacilityAccess()
        # A draft has no derived facility yet. Facility operators are scoped by
        # the ward they are admitting into; the placement facility is derived
        # only after this check succeeds (INV-17).
        identity.require_scope(actor, institution_id=placement.institution_id, facility_id=ward.facility_id)
        occupied = WardAssignment.objects.filter(
            ward_id=ward_id, ended_at=None, placement__state__in=OCCUPYING_STATES
        ).count()
        if occupied >= ward.max_students:
            raise errors.WardCapacityExceeded(occupied=occupied, capacity=ward.max_students)

        current = WardAssignment.objects.filter(placement=placement, ended_at=None).first()
        if current and current.ward_id == ward_id:
            return placement  # already there: nothing to change
        new_facility_id = facilities.facility_id_of_ward(ward_id)
        if current and placement.facility_id and new_facility_id != placement.facility_id:
            # Moving to another facility is a coordinator decision, not a ward change.
            raise errors.InvalidTransition("A ward in another facility cannot be chosen here. Ask the coordinator to change the facility.")
        if current:
            current.ended_at = timezone.now()
            current.save(update_fields=["ended_at"])
        WardAssignment.objects.create(placement=placement, ward_id=ward_id, created_by=actor)
        placement.facility_id = new_facility_id   # derived (INV-17)
        placement.save(update_fields=["facility_id", "updated_at"])

        audit.record(actor=actor, action="placement.change_ward" if current else "placement.allocate_ward",
                     entity_table=TABLE, entity_id=placement.id, scope=_facility_scope(placement))
        outbox.publish(events.WardAllocated(placement_id=placement.id, ward_id=ward_id))
        _maybe_schedule(placement, actor=actor)
    placement.refresh_from_db()
    return placement


def programme_ward_directory(*, actor):
    """Return ward directory rows with the same occupancy predicate as admission."""
    if actor.status != identity.STATUSES.ACTIVE or actor.role not in {
        identity.ROLES.PROGRAM_ADMIN, identity.ROLES.NURSE_MANAGER,
    }:
        return None
    facility_id = actor.facility_id if actor.role == identity.ROLES.NURSE_MANAGER else None
    wards = facilities.ward_directory(program_id=actor.program_id, facility_id=facility_id)
    counts = dict(
        WardAssignment.objects.filter(
            ward_id__in=[ward.id for ward in wards],
            ended_at=None,
            placement__state__in=OCCUPYING_STATES,
        ).values_list("ward_id").annotate(count=models.Count("id"))
    )
    return [
        {
            "id": ward.id,
            "facility_id": ward.facility_id,
            "facility_name": ward.facility.name,
            "name": ward.name,
            "shift_pattern": ward.shift_pattern,
            "max_students": ward.max_students,
            "allocated_students": counts.get(ward.id, 0),
            "available_slots": max(ward.max_students - counts.get(ward.id, 0), 0),
            "available": ward.archived_at is None and ward.facility.archived_at is None,
            "archived_at": ward.archived_at,
        }
        for ward in wards
    ]


def create_programme_ward(*, actor, facility_id: UUID, name: str, max_students: int, shift_pattern: str = ""):
    """Create a directory ward through the owning facilities API."""
    return facilities.create_ward_record(
        actor=actor, facility_id=facility_id, name=name,
        max_students=max_students, shift_pattern=shift_pattern,
    )


def confirm_programme_directory_coverage(*, actor):
    """Require active institution, facility, and ward records before attestation."""
    if actor.status != identity.STATUSES.ACTIVE or actor.role != identity.ROLES.PROGRAM_ADMIN:
        return None
    institution_count = institutions.active_institution_count(program_id=actor.program_id)
    facility_count, ward_count = facilities.active_directory_counts(program_id=actor.program_id)
    if not institution_count or not facility_count or not ward_count:
        raise errors.InvalidTransition(
            "Add at least one active institution, facility, and ward before confirming pilot coverage.",
            institutions=institution_count, facilities=facility_count, wards=ward_count,
        )
    from apps.identity import authentication

    return authentication.confirm_programme_directory_coverage(actor=actor)


@transaction.atomic
def update_programme_ward(*, actor, ward_id: UUID, **data):
    """Update shared ward configuration while enforcing POL-007 under lock."""
    if actor.status != identity.STATUSES.ACTIVE or actor.role not in {identity.ROLES.PROGRAM_ADMIN, identity.ROLES.NURSE_MANAGER}:
        return None
    ward = facilities.lock_ward(ward_id)
    if ward is None or ward.facility.program_id != actor.program_id:
        return None
    if actor.role == identity.ROLES.NURSE_MANAGER and ward.facility_id != actor.facility_id:
        return None
    archived = data.pop("archived", None)
    occupied = WardAssignment.objects.filter(
        ward_id=ward_id,
        ended_at=None,
        placement__state__in=OCCUPYING_STATES,
    ).count()
    if "max_students" in data and data["max_students"] < occupied:
        raise errors.WardCapacityBelowOccupancy(
            occupied=occupied, requested_capacity=data["max_students"],
        )
    for field, value in data.items():
        setattr(ward, field, value)
    if archived is not None:
        ward.archived_at = timezone.now() if archived else None
    ward.save(update_fields=[*data.keys(), "archived_at", "updated_at"])
    audit.record(
        actor=actor, action="ward.updated", entity_table="facilities_ward",
        entity_id=ward.id,
        scope={"program_id": str(actor.program_id), "facility_id": str(ward.facility_id)},
        changes={"fields": list(data), "occupied": occupied,
                 **({"archived": archived} if archived is not None else {})},
    )
    if actor.role == identity.ROLES.PROGRAM_ADMIN:
        identity.invalidate_directory_coverage(actor=actor, program_id=actor.program_id)
    return ward


_QUIET = contextvars.ContextVar("placement_quiet_notifications", default=False)


@contextlib.contextmanager
def quiet_notifications():
    """Suppress per-placement emails while a batch publishes one summary instead."""
    token = _QUIET.set(True)
    try:
        yield
    finally:
        _QUIET.reset(token)


def assign_mentor(placement_id: UUID, mentor_id: UUID, *, actor) -> Placement:
    identity.require_capability(actor, "assign_mentor")
    with transaction.atomic():
        placement = _lock(placement_id)
        identity.require_scope(actor, institution_id=placement.institution_id, facility_id=placement.facility_id)
        _reject_closed(placement)
        policy = identity.mentor_assignment_policy(mentor_id=mentor_id, facility_id=placement.facility_id)
        if not policy["available"]:
            raise errors.InvalidTransition(policy["reason"])
        MentorAssignment.objects.create(placement=placement, mentor_id=mentor_id, created_by=actor)
        audit.record(actor=actor, action="placement.assign_mentor", entity_table=TABLE, entity_id=placement.id,
                     scope=_facility_scope(placement))
        if not _QUIET.get():
            outbox.publish(events.MentorAssigned(placement_id=placement.id, mentor_id=mentor_id, recipient_user_ids=(mentor_id,)))
        _maybe_schedule(placement, actor=actor)
    placement.refresh_from_db()
    return placement


def reassign_mentor(placement_id: UUID, mentor_id: UUID, *, actor, reason: str = "") -> Placement:
    """Closes the current assignment and opens a new one (POL-005, INV-12).

    Sessions, induction and feedback are untouched: they belong to the placement,
    and the outgoing mentor's entries stay attributed to them (Stage 3.5 §5.3).
    """
    identity.require_capability(actor, "assign_mentor")
    with transaction.atomic():
        placement = _lock(placement_id)
        identity.require_scope(actor, institution_id=placement.institution_id, facility_id=placement.facility_id)
        _reject_closed(placement)
        current = MentorAssignment.objects.select_for_update().filter(
            placement=placement, ended_at=None
        ).first()
        if current is None:
            raise errors.InvalidTransition("This placement has no mentor to reassign.")
        if current.mentor_id == mentor_id:
            raise errors.MentorAlreadyAssigned()
        policy = identity.mentor_assignment_policy(mentor_id=mentor_id, facility_id=placement.facility_id)
        if not policy["available"]:
            raise errors.InvalidTransition(policy["reason"])
        previous_mentor_id = current.mentor_id
        current.ended_at = timezone.now()
        current.end_reason = reason or "reassigned"
        current.save(update_fields=["ended_at", "end_reason", "updated_at"])
        MentorAssignment.objects.create(placement=placement, mentor_id=mentor_id, created_by=actor)

        audit.record(
            actor=actor, action="placement.reassign_mentor", entity_table=TABLE, entity_id=placement.id,
            scope=_facility_scope(placement),
            changes={"mentor_id": {"from": str(previous_mentor_id), "to": str(mentor_id)}},
        )
        outbox.publish(events.MentorReassigned(
            placement_id=placement.id, mentor_id=mentor_id, previous_mentor_id=previous_mentor_id,
            recipient_user_ids=(mentor_id, previous_mentor_id),
        ))
    placement.refresh_from_db()
    return placement


def transition(placement_id: UUID, target: State, *, actor, reason: str | None = None,
               asserted_by: str | None = None) -> Placement:
    """The only path to a state change (Stage 4 §4.3)."""
    with transaction.atomic():
        placement = _lock(placement_id)
        identity.require_scope(actor, institution_id=placement.institution_id, facility_id=placement.facility_id)
        _reject_terminal(placement)
        rule = state_machine.find(placement.state, target)
        _require_transition_authority(rule, placement, actor, asserted_by)
        if rule.requires_reason and not (reason or "").strip():
            raise errors.OverrideReasonRequired("A reason is required for this change.")
        if target == State.WITHDRAWN and reason not in WithdrawalReason.values:
            raise errors.InvalidTransition("Choose a recognised withdrawal reason.")

        if target == State.COMPLETED:
            _check_completion_blockers(placement)
        if target == State.AWAITING_STUDENT:
            from apps.learning import api as learning
            mentor = MentorAssignment.objects.filter(placement=placement, ended_at=None).first()
            if mentor and placement.cohort.institution.program.require_mentor_training_before_placement and not learning.required_modules_complete(mentor.mentor):
                raise errors.TrainingIncomplete()
        _apply(placement, target, actor=actor, reason=reason)

        audit.record(
            actor=actor, action=f"placement.transition.{rule.id}", entity_table=TABLE,
            entity_id=placement.id,
            scope=_facility_scope(placement) if placement.facility_id else _institution_scope(actor, placement.institution_id),
            changes={"state": {"from": str(rule.source), "to": str(rule.target)},
                     "asserted_by": asserted_by},
            override_reason=reason if rule.requires_reason else None,
        )
    placement.refresh_from_db()
    return placement


@transaction.atomic
def confirm_student_placement(placement_id: UUID, signed_name: str, *, actor) -> Placement:
    """Record the student's typed acknowledgement and advance the assignment."""
    normalized_name = " ".join((signed_name or "").split())
    account_name = " ".join(actor.full_name.split())
    if not normalized_name or normalized_name.casefold() != account_name.casefold():
        raise errors.AcknowledgementNameMismatch()
    placement = _lock(placement_id)
    identity.require_scope(actor, institution_id=placement.institution_id, facility_id=placement.facility_id)
    if PlacementAcknowledgement.objects.filter(placement=placement).exists():
        raise errors.AcknowledgementAlreadySigned()
    if placement.state == State.AWAITING_STUDENT:
        placement = transition(
            placement_id, State.ORIENTATION, actor=actor,
            asserted_by="student.confirm_placement",
        )
    elif placement.state == State.ORIENTATION:
        # Older records could have reached Orientation through the former
        # checkbox-only flow. Capture a truthful signature date now, without
        # pretending it was signed during the earlier transition.
        identity.require_capability(actor, "confirm_placement")
        _require_active_student_assignment(placement, actor)
    else:
        raise errors.InvalidTransition("This placement is not awaiting student acknowledgement.")
    acknowledgement = PlacementAcknowledgement.objects.create(
        placement=placement, student=actor, signed_name=normalized_name,
    )
    audit.record(
        actor=actor, action="placement.assignment_acknowledged",
        entity_table="placements_acknowledgement", entity_id=acknowledgement.id,
        scope=(
            _facility_scope(placement)
            if placement.facility_id
            else _institution_scope(actor, placement.institution_id)
        ),
        changes={"placement_id": str(placement.id), "signed_at": acknowledgement.signed_at.isoformat()},
    )
    return placement


def placement_acknowledgement(placement_id: UUID, *, actor) -> PlacementAcknowledgement | None:
    placement = Placement.objects.filter(id=placement_id).first()
    if placement is None:
        raise errors.UnauthorizedFacilityAccess()
    identity.require_scope(actor, institution_id=placement.institution_id, facility_id=placement.facility_id)
    if actor.role == "student" and not StudentAssignment.objects.filter(
        placement=placement, student=actor, ended_at=None,
    ).exists():
        raise errors.UnauthorizedFacilityAccess()
    acknowledgement = PlacementAcknowledgement.objects.filter(placement=placement).first()
    if actor.role == "student" and acknowledgement and acknowledgement.student_id != actor.id:
        raise errors.UnauthorizedFacilityAccess()
    return acknowledgement


def pause(placement_id: UUID, *, actor, reason: str, note: str | None = None,
          started_on: dt.date | None = None) -> Placement:
    identity.require_capability(actor, "pause_placement")
    if reason not in PauseReason.values:
        raise errors.InvalidTransition("Choose a recognised pause reason.")
    with transaction.atomic():
        placement = _lock(placement_id)
        identity.require_scope(actor, institution_id=placement.institution_id, facility_id=placement.facility_id)
        state_machine.find(placement.state, State.PAUSED)
        PauseInterval.objects.create(
            placement=placement, started_on=started_on or timezone.localdate(),
            reason=reason, reason_note=note, paused_by=actor,
        )
        placement.state = State.PAUSED
        placement.version += 1
        placement.save(update_fields=["state", "version", "updated_at"])
        audit.record(actor=actor, action="placement.pause", entity_table=TABLE, entity_id=placement.id,
                     scope=_facility_scope(placement),
                     override_reason=reason)
        outbox.publish(events.PlacementPaused(placement_id=placement.id, reason=reason, recipient_user_ids=_placement_recipient_ids(placement)))
    placement.refresh_from_db()
    return placement


def resume(placement_id: UUID, *, actor, ended_on: dt.date | None = None) -> Placement:
    """POL-020: the pause extends actual_end, so the student keeps their time."""
    identity.require_capability(actor, "resume_placement")
    with transaction.atomic():
        placement = _lock(placement_id)
        identity.require_scope(actor, institution_id=placement.institution_id, facility_id=placement.facility_id)
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
        extended_end = (placement.actual_end or placement.planned_end) + dt.timedelta(days=paused_days)
        # Historical repair dates must still satisfy actual_start <= actual_end.
        placement.actual_end = max(extended_end, placement.actual_start or extended_end)
        placement.state = State.ACTIVE
        placement.version += 1
        placement.save(update_fields=["state", "actual_end", "version", "updated_at"])

        audit.record(actor=actor, action="placement.resume", entity_table=TABLE, entity_id=placement.id,
                     scope=_facility_scope(placement),
                     changes={"actual_end": {"to": str(placement.actual_end), "paused_days": paused_days}})
        outbox.publish(events.PlacementResumed(placement_id=placement.id, recipient_user_ids=_placement_recipient_ids(placement)))
    placement.refresh_from_db()
    return placement


# --------------------------------------------------------------------------- internals
def _lock(placement_id: UUID) -> Placement:
    placement = Placement.objects.select_for_update().filter(id=placement_id).first()
    if placement is None:
        raise errors.UnauthorizedFacilityAccess()       # 404, never 403 (SEC-03)
    return placement


def verify_session_write(placement_id: UUID, *, actor, session_date: dt.date) -> SessionWriteAuthority:
    """Lock and re-check every session guard in the caller's transaction.

    This deliberately lives in placements: only the aggregate owner may decide
    whether its state, window, pause intervals and mentor assignment permit a
    child write.  Callers must already be inside ``transaction.atomic()``.
    """
    identity.require_capability(actor, "log_session")
    placement = _lock(placement_id)
    identity.require_scope(actor, institution_id=placement.institution_id, facility_id=placement.facility_id)
    assignment = MentorAssignment.objects.select_for_update().filter(
        placement=placement, ended_at=None
    ).first()
    if assignment is None or assignment.mentor_id != actor.id:
        raise errors.UnauthorizedFacilityAccess()
    if placement.state != State.ACTIVE:
        raise errors.PlacementNotActive(state=placement.state)
    end = placement.actual_end or placement.planned_end
    if not (placement.planned_start <= session_date <= end):
        raise errors.SessionOutsidePlacementWindow(
            session_date=str(session_date), window=[str(placement.planned_start), str(end)]
        )
    if PauseInterval.objects.filter(
        placement=placement, started_on__lte=session_date
    ).filter(models.Q(ended_on=None) | models.Q(ended_on__gt=session_date)).exists():
        raise errors.SessionOutsidePlacementWindow(reason="date falls inside a pause")
    return SessionWriteAuthority(mentor_assignment_id=assignment.id)


def verify_assessment_write(placement_id: UUID, *, actor) -> AssessmentWriteAuthority:
    """Lock placement scope and student assignment before an assessment write."""
    with transaction.atomic():
        placement = _lock(placement_id)
        identity.require_scope(actor, institution_id=placement.institution_id, facility_id=placement.facility_id)
        assignment = StudentAssignment.objects.select_for_update().filter(
            placement=placement, ended_at=None, student_id=actor.id
        ).first()
        if assignment is None:
            raise errors.UnauthorizedFacilityAccess()
        return AssessmentWriteAuthority(
            placement_id=placement.id,
            effective_end=placement.actual_end or placement.planned_end,
            state=placement.state,
        )


def _reject_terminal(placement: Placement) -> None:
    if placement.state in TERMINAL_STATES:
        raise errors.PlacementArchived()


def _reject_closed(placement: Placement) -> None:
    """A completed placement is a closed record: ward and mentor can no longer change."""
    _reject_terminal(placement)
    if placement.state == State.COMPLETED:
        raise errors.PlacementClosed("This placement is completed, so its ward and mentor can no longer be changed.")


def _require_transition_authority(
    rule: state_machine.Transition, placement: Placement, actor, asserted_by: str | None
) -> None:
    """Apply authority to the exact edge, not merely its destination state."""
    if rule.id in SPECIALISED_TRANSITIONS:
        raise errors.InvalidTransition("Use the placement pause or resume command.")
    if rule.system_derived:
        expected = SYSTEM_TRANSITION_CAPABILITIES.get(rule.id)
        if expected is None or asserted_by != expected[0]:
            raise errors.InvalidTransition("That change is system-managed.")
        identity.require_capability(actor, expected[1])
        if rule.id == "T-06":
            _require_active_student_assignment(placement, actor)
        elif rule.id == "T-10":
            _require_active_mentor_assignment(placement, actor)
        return
    capability = TRANSITION_CAPABILITIES.get(rule.id)
    if capability is None:
        raise errors.InvalidTransition("That change is not supported.")
    identity.require_capability(actor, capability)
    # A mentor may open induction only for a student currently assigned to
    # them. A Nurse Manager has the documented operational override, so their
    # authority intentionally does not depend on being the assigned mentor.
    if rule.id == "T-08" and actor.role == "mentor":
        _require_active_mentor_assignment(placement, actor)


def _require_active_student_assignment(placement: Placement, actor) -> None:
    """Re-check the confirming student under the placement row lock (T-06)."""
    assignment = StudentAssignment.objects.select_for_update().filter(
        placement=placement, ended_at=None
    ).first()
    if assignment is None or assignment.student_id != actor.id:
        raise errors.UnauthorizedFacilityAccess()


def _require_active_mentor_assignment(placement: Placement, actor) -> None:
    """Re-check the mentor originating an induction action (T-08/T-10)."""
    assignment = MentorAssignment.objects.select_for_update().filter(
        placement=placement, ended_at=None
    ).first()
    if assignment is None or assignment.mentor_id != actor.id:
        raise errors.UnauthorizedFacilityAccess()


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
        State.SCHEDULED: events.PlacementScheduled(
            placement_id=placement.id,
            recipient_user_ids=tuple(identity.users(
                role=identity.ROLES.COORDINATOR, status=identity.STATUSES.ACTIVE,
                institution_id=placement.institution_id,
            ).values_list("id", flat=True)),
        ),
        State.COMPLETED: events.PlacementCompleted(placement_id=placement.id, recipient_user_ids=_placement_recipient_ids(placement)),
        State.WITHDRAWN: events.PlacementWithdrawn(placement_id=placement.id, reason=reason or "", recipient_user_ids=_placement_recipient_ids(placement)),
    }.get(target)
    if event is not None and not (_QUIET.get() and target == State.SCHEDULED):
        outbox.publish(event)


def _placement_recipient_ids(placement: Placement) -> tuple[UUID, ...]:
    """Return active participant identifiers without copying placement content."""
    student_id = StudentAssignment.objects.filter(placement=placement, ended_at=None).values_list("student_id", flat=True).first()
    mentor_id = MentorAssignment.objects.filter(placement=placement, ended_at=None).values_list("mentor_id", flat=True).first()
    return tuple(value for value in (student_id, mentor_id) if value is not None)


def _maybe_schedule(placement: Placement, *, actor) -> None:
    """T-01 is system-derived (WFR-002).

    The assignment set is completed by two different institutions — the
    Coordinator creates the placement, while the Nurse Manager allocates the
    ward and assigns the mentor — so neither may press the other's button. The
    transition fires when the set is
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
