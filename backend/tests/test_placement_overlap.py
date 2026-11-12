"""A student's time is held only by a LIVE placement.

Regression for: a student could not be given a new placement even when the old
one was withdrawn, archived, completed or long past its end date, because the
assignment's ``ended_on`` was never written and the exclusion constraint saw an
open-ended range for every placement.
"""

import datetime as dt

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.core import errors
from apps.institutions import services as institution_services
from apps.institutions.models import Cohort, CohortMembership
from apps.placements import services as placement_services
from apps.placements.models import Placement, State, StudentAssignment

D = dt.date
OVERLAP = "student_no_overlapping_placements"  # mapped to StudentAlreadyAssigned (409) at the HTTP layer


def _create(cohort, student, coordinator, start, end):
    return placement_services.create_placement(
        placement_services.CreatePlacement(
            cohort_id=cohort.id, student_id=student.id, planned_start=start, planned_end=end,
        ),
        actor=coordinator,
    )


def _hold(placement):
    return StudentAssignment.objects.get(placement=placement)


def _complete(placement, on: dt.date):
    """Mark completed as the lifecycle would, then let the service re-derive the hold."""
    Placement.objects.filter(id=placement.id).update(
        state=State.COMPLETED, completed_at=timezone.make_aware(dt.datetime.combine(on, dt.time(10, 0)))
    )
    placement.refresh_from_db()
    placement_services.sync_student_hold(placement)
    return placement


# --------------------------------------------------------------------------- single create
@pytest.mark.django_db
def test_live_overlap_is_still_rejected_by_the_service(cohort, student, coordinator):
    _create(cohort, student, coordinator, D(2026, 7, 1), D(2026, 8, 31))
    with pytest.raises(IntegrityError, match=OVERLAP), transaction.atomic():
        _create(cohort, student, coordinator, D(2026, 8, 31), D(2026, 10, 1))  # end day is held (inclusive)
    # The day after the end is free.
    assert _create(cohort, student, coordinator, D(2026, 9, 1), D(2026, 10, 1))


@pytest.mark.django_db(transaction=True)
def test_live_overlap_is_rejected_by_the_database(cohort, student, coordinator):
    first = _create(cohort, student, coordinator, D(2026, 7, 1), D(2026, 8, 31))
    with pytest.raises(IntegrityError) as raised, transaction.atomic():
        StudentAssignment.objects.create(
            placement=_bare_placement(cohort, coordinator, D(2026, 8, 1), D(2026, 9, 30)),
            student=student, started_on=D(2026, 8, 1), ended_on=D(2026, 10, 1), created_by=coordinator,
        )
    assert "student_no_overlapping_placements" in str(raised.value)
    assert _hold(first).ended_on == D(2026, 9, 1)


def _bare_placement(cohort, coordinator, start, end):
    return Placement.objects.create(
        cohort=cohort, institution=cohort.institution, planned_start=start, planned_end=end, created_by=coordinator,
    )


@pytest.mark.django_db
def test_past_placement_does_not_block_a_later_one(cohort, student, coordinator):
    old = _create(cohort, student, coordinator, D(2026, 7, 1), D(2026, 7, 31))
    assert _hold(old).ended_on == D(2026, 8, 1)  # bounded, not open-ended
    assert _create(cohort, student, coordinator, D(2026, 8, 1), D(2026, 9, 30))


@pytest.mark.django_db
def test_withdrawn_placement_never_blocks(cohort, student, coordinator):
    old = _create(cohort, student, coordinator, D(2026, 7, 1), D(2026, 9, 30))
    placement_services.transition(old.id, State.WITHDRAWN, actor=coordinator, reason="student_withdrew")
    assert _hold(old).ended_on == _hold(old).started_on  # holds nothing
    assert _create(cohort, student, coordinator, D(2026, 7, 15), D(2026, 8, 15))  # same dates, fully overlapping


@pytest.mark.django_db
def test_archived_placement_never_blocks(cohort, student, coordinator):
    old = _create(cohort, student, coordinator, D(2026, 7, 1), D(2026, 9, 30))
    _complete(old, D(2026, 9, 30))
    placement_services._apply(Placement.objects.get(id=old.id), State.ARCHIVED, actor=coordinator, reason=None)
    assert _hold(old).ended_on == _hold(old).started_on
    assert _create(cohort, student, coordinator, D(2026, 8, 1), D(2026, 10, 30))


@pytest.mark.django_db
def test_completed_placement_blocks_only_up_to_its_real_end(cohort, student, coordinator):
    old = _create(cohort, student, coordinator, D(2026, 7, 1), D(2026, 9, 30))
    _complete(old, D(2026, 8, 15))  # finished early
    assert _hold(old).ended_on == D(2026, 8, 16)
    with pytest.raises(IntegrityError, match=OVERLAP), transaction.atomic():
        _create(cohort, student, coordinator, D(2026, 8, 15), D(2026, 10, 1))
    assert _create(cohort, student, coordinator, D(2026, 8, 16), D(2026, 10, 1))


@pytest.mark.django_db
def test_completion_after_the_end_date_does_not_extend_the_hold(cohort, student, coordinator):
    old = _create(cohort, student, coordinator, D(2026, 7, 1), D(2026, 7, 31))
    _complete(old, D(2026, 8, 20))  # signed off late
    assert _hold(old).ended_on == D(2026, 8, 1)
    assert _create(cohort, student, coordinator, D(2026, 8, 1), D(2026, 9, 1))


@pytest.mark.django_db
def test_resume_extends_hold(cohort, student, coordinator, nurse_manager, facility):
    from apps.placements.models import PauseInterval

    placement = _create(cohort, student, coordinator, D(2026, 7, 1), D(2026, 7, 31))
    Placement.objects.filter(id=placement.id).update(state=State.PAUSED, actual_start=D(2026, 7, 1), facility=facility)
    PauseInterval.objects.create(placement_id=placement.id, started_on=D(2026, 7, 10), reason="other", paused_by=nurse_manager)
    placement_services.resume(placement.id, actor=nurse_manager, ended_on=D(2026, 7, 20))  # 10 paused days
    assert Placement.objects.get(id=placement.id).actual_end == D(2026, 8, 10)
    assert _hold(placement).ended_on == D(2026, 8, 11)
    with pytest.raises(IntegrityError, match=OVERLAP), transaction.atomic():
        _create(cohort, student, coordinator, D(2026, 8, 5), D(2026, 9, 1))
    assert _create(cohort, student, coordinator, D(2026, 8, 11), D(2026, 9, 1))


# --------------------------------------------------------------------------- bulk + eligibility agree
@pytest.mark.django_db
def test_eligibility_and_bulk_agree_with_single_create(cohort, student, coordinator):
    live = _create(cohort, student, coordinator, D(2026, 7, 1), D(2026, 8, 31))
    cases = [
        (D(2026, 8, 15), D(2026, 10, 1), False),   # overlaps the live placement
        (D(2026, 9, 1), D(2026, 10, 1), True),     # starts after it
        (D(2026, 5, 1), D(2026, 6, 30), True),     # entirely before it
    ]
    for start, end, allowed in cases:
        listing = placement_services.placement_eligible_students(
            actor=coordinator, cohort_id=cohort.id, planned_start=start, planned_end=end
        )
        assert (str(student.id) in [row["id"] for row in listing["eligible"]]) is allowed
        assert (str(student.id) in [row["id"] for row in listing["excluded"]]) is (not allowed)
        result = placement_services.bulk_create_placements(
            placement_services.BulkCreatePlacements(
                cohort_id=cohort.id, student_ids=[student.id], planned_start=start, planned_end=end
            ),
            actor=coordinator,
        )
        assert bool(result["created"]) is allowed
        assert [row["reason"] for row in result["skipped"]] == ([] if allowed else ["overlapping_placement"])
        for placement in result["created"]:   # keep later cases independent
            placement_services.transition(placement.id, State.WITHDRAWN, actor=coordinator, reason="administrative_error")
    assert live.id


@pytest.mark.django_db
def test_withdrawn_and_archived_students_are_eligible_again(cohort, student, coordinator):
    old = _create(cohort, student, coordinator, D(2026, 7, 1), D(2026, 9, 30))
    placement_services.transition(old.id, State.WITHDRAWN, actor=coordinator, reason="student_withdrew")
    listing = placement_services.placement_eligible_students(
        actor=coordinator, cohort_id=cohort.id, planned_start=D(2026, 7, 1), planned_end=D(2026, 9, 30)
    )
    assert [row["id"] for row in listing["eligible"]] == [str(student.id)]


# --------------------------------------------------------------------------- cohorts
def _other_cohort(institution, name, start, end, **extra):
    return Cohort.objects.create(institution=institution, name=name, start_date=start, end_date=end, **extra)


@pytest.mark.django_db
def test_real_cohort_overlap_still_rejected(coordinator, institution, student, cohort):
    clash = _other_cohort(institution, "Clash", D(2026, 11, 1), D(2027, 3, 1))
    with pytest.raises(errors.CohortOverlap):
        institution_services.enrol_student(actor=coordinator, cohort_id=clash.id, student_id=student.id)


@pytest.mark.django_db
def test_archived_ended_and_removed_cohorts_do_not_clash(coordinator, institution, student, cohort):
    # Cohort ended before the new one starts: no clash (end is exclusive).
    later = _other_cohort(institution, "Later", D(2026, 12, 1), D(2027, 3, 1))
    assert institution_services.enrol_student(actor=coordinator, cohort_id=later.id, student_id=student.id)[1]

    # Archived cohort does not clash.
    institution_services.archive_cohort(actor=coordinator, cohort_id=cohort.id)
    overlapping = _other_cohort(institution, "During archived", D(2026, 8, 1), D(2026, 9, 1))
    assert institution_services.enrol_student(actor=coordinator, cohort_id=overlapping.id, student_id=student.id)[1]

    # Removed membership does not clash.
    institution_services.remove_cohort_membership(
        actor=coordinator, cohort_id=overlapping.id, student_id=student.id, reason="moved"
    )
    again = _other_cohort(institution, "During removed", D(2026, 8, 15), D(2026, 9, 15))
    assert institution_services.enrol_student(actor=coordinator, cohort_id=again.id, student_id=student.id)[1]


@pytest.mark.django_db
def test_bulk_enrol_preview_ignores_finished_cohorts(coordinator, institution, student, cohort):
    later = _other_cohort(institution, "Later", D(2026, 12, 1), D(2027, 3, 1))
    clash = _other_cohort(institution, "Clash", D(2026, 11, 1), D(2027, 3, 1))
    ok = institution_services.preview_bulk_enrolment(actor=coordinator, cohort_id=later.id, student_ids=[student.id])
    bad = institution_services.preview_bulk_enrolment(actor=coordinator, cohort_id=clash.id, student_ids=[student.id])
    assert ok["counts"]["ready"] == 1 and bad["counts"]["overlap"] == 1


@pytest.mark.django_db
def test_editing_a_cohort_checks_members_against_live_cohorts_only(coordinator, institution, student, cohort):
    other = _other_cohort(institution, "Next", D(2027, 1, 1), D(2027, 6, 1))
    institution_services.enrol_student(actor=coordinator, cohort_id=other.id, student_id=student.id)
    # Stretching the first cohort into the second is a real overlap.
    with pytest.raises(errors.CohortOverlap):
        institution_services.update_cohort(actor=coordinator, cohort_id=cohort.id, end_date=D(2027, 2, 1))
    # Once the second is archived, the same edit is fine.
    institution_services.archive_cohort(actor=coordinator, cohort_id=other.id)
    assert institution_services.update_cohort(actor=coordinator, cohort_id=cohort.id, end_date=D(2027, 2, 1))
    assert CohortMembership.objects.filter(student=student, removed_at=None).count() == 2


# --------------------------------------------------------------------------- data repair
@pytest.mark.django_db
@pytest.mark.parametrize("withdraw", [False, True])
def test_repair_migration_bounds_legacy_open_ended_assignments(cohort, student, coordinator, withdraw):
    import importlib

    from django.apps import apps

    repair = importlib.import_module("apps.placements.migrations.0012_release_finished_student_holds")
    old = _create(cohort, student, coordinator, D(2026, 1, 1), D(2026, 1, 31))
    if withdraw:
        placement_services.transition(old.id, State.WITHDRAWN, actor=coordinator, reason="student_withdrew")
    StudentAssignment.objects.update(ended_on=None)  # the legacy shape: open-ended hold
    with pytest.raises(IntegrityError, match=OVERLAP), transaction.atomic():
        _create(cohort, student, coordinator, D(2026, 3, 1), D(2026, 3, 31))  # blocked before repair
    repair.release_finished_holds(apps, None)
    expected = _hold(old).started_on if withdraw else D(2026, 2, 1)
    assert _hold(old).ended_on == expected
    assert _create(cohort, student, coordinator, D(2026, 3, 1), D(2026, 3, 31))
