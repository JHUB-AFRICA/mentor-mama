"""Placement allocation: audit fixes and the read APIs the coordinator and nurse-manager screens use.

Run with the isolated wrapper only:  scripts/pytest-isolated.sh alloc tests/test_allocation_enhancements.py -q
"""

from __future__ import annotations

import datetime as dt
import itertools
import threading
import time
import uuid
from uuid import UUID

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core import errors
from apps.core.models import OutboxEvent
from apps.facilities.models import Facility, Ward
from apps.identity.models import Program, Role, Status, User
from apps.institutions.models import Cohort, CohortMembership, Institution
from apps.learning.models import TrainingModule
from apps.placements import allocation, allocation_results, capacity, planning, services
from apps.placements.models import AllocationRun, MentorAssignment, Placement, State, StudentAssignment, WardAssignment

HEADERS = {"HTTP_X_REQUESTED_WITH": "mentormama"}
_UNIQUE = itertools.count(1)
START = dt.date.today() + dt.timedelta(days=30)
END = START + dt.timedelta(days=60)

pytestmark = pytest.mark.django_db


def make_user(program, role, email, **extra):
    return User.objects.create_user(
        email=email, password="pw", first_name=email.split("@")[0].title(), last_name="Test",
        role=role, status=Status.ACTIVE, program=program, **extra,
    )


def api(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def post(user, path, body):
    return api(user).post(f"/api/v1/{path}", body, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS)


def get(user, path):
    return api(user).get(f"/api/v1/{path}", **HEADERS)


class World:
    """A programme with one school (n students), several facilities with wards and mentors."""

    def __init__(self, *, students=60, ward_caps=((10, 10), (6, 6), (4,)), mentors_per=3, max_active=5, start=START, end=END):
        self.tag = next(_UNIQUE)
        self.program = Program.objects.create(name="Pilot")
        self.institution = Institution.objects.create(program=self.program, name="School A")
        self.coordinator = make_user(self.program, Role.COORDINATOR, f"coord{self.tag}@a.org", institution_id=self.institution.id)
        self.cohort = Cohort.objects.create(institution=self.institution, name="Cohort A", start_date=start, end_date=end + dt.timedelta(days=60))
        self.start, self.end = start, end
        self.facilities = []
        for index, caps in enumerate(ward_caps):
            facility = Facility.objects.create(program=self.program, name=f"Facility {index}")
            manager = make_user(self.program, Role.NURSE_MANAGER, f"nm{self.tag}{index}@a.org", facility_id=facility.id)
            wards = [Ward.objects.create(facility=facility, name=f"Ward {index}.{j}", max_students=cap) for j, cap in enumerate(caps)]
            mentors = [make_user(self.program, Role.MENTOR, f"mentor{self.tag}{index}{k}@a.org", facility_id=facility.id, max_active_placements=max_active) for k in range(mentors_per)]
            self.facilities.append((facility, manager, wards, mentors))
        self.students = []
        self.add_students(students)
        self.placements = []
        if students:
            self.create_placements(self.students)

    def add_students(self, count, prefix="s"):
        base = len(self.students)
        new = []
        for n in range(count):
            student = make_user(self.program, Role.STUDENT, f"{prefix}{base + n}x{self.tag}@students.a.org", institution_id=self.institution.id,
                                registration_number=f"REG/{base + n:04d}")
            CohortMembership.objects.create(cohort=self.cohort, student=student)
            new.append(student)
        self.students += new
        return new

    def create_placements(self, students, start=None, end=None):
        result = services.bulk_create_placements(services.BulkCreatePlacements(
            cohort_id=self.cohort.id, student_ids=[s.id for s in students], planned_start=start or self.start, planned_end=end or self.end), actor=self.coordinator)
        self.placements += result["created"]
        return result["created"]

    @property
    def facility_ids(self):
        return [f[0].id for f in self.facilities]

    def request_all(self, facility_index=0, placements=None):
        ids = [p.id for p in (placements if placements is not None else self.placements)]
        return allocation.request_facility(actor=self.coordinator, placement_ids=ids, facility_id=self.facilities[facility_index][0].id)

    def second_school(self, students=3, label="B"):
        institution = Institution.objects.create(program=self.program, name=f"School {label}")
        coordinator = make_user(self.program, Role.COORDINATOR, f"coord{label.lower()}{self.tag}@b.org", institution_id=institution.id)
        cohort = Cohort.objects.create(institution=institution, name=f"Cohort {label}", start_date=self.start, end_date=self.end + dt.timedelta(days=60))
        people = []
        for n in range(students):
            student = make_user(self.program, Role.STUDENT, f"{label.lower()}{n}x{self.tag}@students.b.org", institution_id=institution.id)
            CohortMembership.objects.create(cohort=cohort, student=student)
            people.append(student)
        created = services.bulk_create_placements(services.BulkCreatePlacements(
            cohort_id=cohort.id, student_ids=[s.id for s in people], planned_start=self.start, planned_end=self.end), actor=coordinator)["created"]
        return coordinator, cohort, created


@pytest.fixture
def world():
    return World()


# ------------------------------------------------------------------ request: validation and safety


def test_request_refuses_unknown_and_foreign_programme_facilities(world):
    ids = [p.id for p in world.placements[:2]]
    foreign = Facility.objects.create(program=Program.objects.create(name="Other programme"), name="Foreign")
    for bad in (uuid.uuid4(), foreign.id):
        with pytest.raises(errors.InvalidTransition):
            allocation.request_facility(actor=world.coordinator, placement_ids=ids, facility_id=bad)
        with pytest.raises(errors.InvalidTransition):
            allocation.plan_facility_split(actor=world.coordinator, placement_ids=ids, facility_ids=[world.facility_ids[0], bad])
    assert not Placement.objects.filter(id__in=ids, requested_facility__isnull=False).exists()


def test_http_request_with_a_foreign_facility_is_a_clean_conflict_not_a_500(world):
    foreign = Facility.objects.create(program=Program.objects.create(name="Other programme"), name="Foreign")
    response = post(world.coordinator, "placements/facility-requests", {"placement_ids": [str(world.placements[0].id)], "facility_ids": [str(foreign.id)]})
    assert response.status_code == 409 and response.json()["error"]["code"] == "InvalidTransition"


def test_capacity_split_with_no_room_requests_nobody_instead_of_falling_back_to_even(world):
    empty = Facility.objects.create(program=world.program, name="No wards yet")
    plan = allocation.plan_facility_split(actor=world.coordinator, placement_ids=[p.id for p in world.placements[:5]], facility_ids=[empty.id], mode="capacity")
    assert plan["assignments"] == [] and len(plan["unplaced"]) == 5
    assert "free ward place" in plan["unplaced"][0]["reason"]
    assert any("no active wards" in w for w in plan["warnings"])


def test_even_split_is_explicit_and_warns_when_it_exceeds_free_places(world):
    plan = allocation.plan_facility_split(actor=world.coordinator, placement_ids=[p.id for p in world.placements], facility_ids=world.facility_ids, mode="even", seed="evenseed")
    assert sorted(f["requested"] for f in plan["facilities"]) == [20, 20, 20]
    assert any("Facility 2 would receive 20 requests for 4 free places" in w for w in plan["warnings"])


def test_a_request_is_never_silently_overwritten(world):
    ids = [p.id for p in world.placements[:3]]
    world.request_all(0, world.placements[:3])
    with pytest.raises(errors.InvalidTransition) as raised:
        allocation.request_facility(actor=world.coordinator, placement_ids=ids, facility_id=world.facilities[1][0].id)
    assert len(raised.value.details["skipped"]) == 3
    assert "Already requested of Facility 0" in raised.value.details["skipped"][0]["reason"]
    assert set(Placement.objects.filter(id__in=ids).values_list("requested_facility__name", flat=True)) == {"Facility 0"}
    # A mixed list requests the free ones and reports the rest.
    result = allocation.request_facility(actor=world.coordinator, placement_ids=[*ids, world.placements[3].id], facility_id=world.facilities[1][0].id)
    assert result["requested"] == 1 and len(result["skipped"]) == 3 and "Already requested of Facility 0" in result["skipped"][0]["reason"]
    # Withdrawing frees them for another facility, and clears the "requested since" time.
    allocation.withdraw_requests(actor=world.coordinator, placement_ids=ids)
    assert not Placement.objects.filter(id__in=ids, requested_at__isnull=False).exists()
    assert allocation.request_facility(actor=world.coordinator, placement_ids=ids, facility_id=world.facilities[1][0].id)["requested"] == 3


def test_request_records_when_and_by_whom_and_notifies_the_facility_managers(world):
    before = timezone.now()
    result = world.request_all(1, world.placements[:4])
    assert Placement.objects.filter(requested_facility=world.facilities[1][0], requested_at__gte=before).count() == 4
    event = OutboxEvent.objects.filter(event_type="PlacementsRequested").latest("occurred_at")
    assert event.payload["count"] == 4 and event.payload["recipient_user_ids"] == [str(world.facilities[1][1].id)]
    run = AllocationRun.objects.get(id=result["run_id"])
    assert run.result["requested"] == 4 and run.institution_ids == [str(world.institution.id)]


# ------------------------------------------------------------------ capacity awareness


def test_split_is_proportional_to_free_places_and_never_exceeds_them():
    world = World(students=24)
    plan = allocation.plan_facility_split(actor=world.coordinator, placement_ids=[p.id for p in world.placements], facility_ids=world.facility_ids, seed="propor1")
    got = {f["name"]: f["requested"] for f in plan["facilities"]}
    free = {f["name"]: f["free_capacity"] for f in plan["facilities"]}
    assert sum(got.values()) == 24 and not plan["unplaced"]
    assert all(got[name] <= free[name] for name in got)
    # 24 students over 20/12/4 free places: shares of 13.3, 8 and 2.7 (largest remainder).
    assert got == {"Facility 0": 13, "Facility 1": 8, "Facility 2": 3}


def test_split_with_more_students_than_places_fills_each_facility_and_reports_the_rest(world):
    plan = allocation.plan_facility_split(actor=world.coordinator, placement_ids=[p.id for p in world.placements], facility_ids=world.facility_ids, seed="overflow1")
    assert {f["name"]: f["requested"] for f in plan["facilities"]} == {"Facility 0": 20, "Facility 1": 12, "Facility 2": 4}
    assert len(plan["assignments"]) == 36 and len(plan["unplaced"]) == 24
    assert "36 free places" in plan["unplaced"][0]["reason"]


def test_occupancy_is_overlap_aware_and_ignores_archived_wards_and_empty_facilities(world):
    facility, manager, wards, mentors = world.facilities[1]
    # Fill Facility 1 / Ward 1.0 (cap 6) with 6 students for the cohort dates.
    first_six = world.placements[:6]
    world.request_all(1, first_six)
    allocation.apply_auto_arrange(actor=manager, strategy="fill", seed="fill0001")
    rows = {r["name"]: r for r in capacity.facility_capacity(program_id=world.program.id, start=world.start, end=world.end)}
    assert rows["Facility 1"]["occupied"] == 6 and rows["Facility 1"]["free"] == 6
    # Dates that do not touch the occupied window see the full capacity again; touching by one day does not.
    after = capacity.facility_capacity(program_id=world.program.id, start=world.end + dt.timedelta(days=1), end=world.end + dt.timedelta(days=40))
    assert {r["name"]: r["free"] for r in after}["Facility 1"] == 12
    touching = capacity.facility_capacity(program_id=world.program.id, start=world.end, end=world.end + dt.timedelta(days=40))
    assert {r["name"]: r["free"] for r in touching}["Facility 1"] == 6
    # An archived ward is not capacity; a facility with no wards offers nothing and says so.
    Ward.objects.filter(id=wards[1].id).update(archived_at=timezone.now())
    Facility.objects.create(program=world.program, name="Bare")
    rows = {r["name"]: r for r in capacity.facility_capacity(program_id=world.program.id, start=world.start, end=world.end)}
    assert rows["Facility 1"]["capacity"] == 6 and rows["Facility 1"]["free"] == 0  # remaining ward is full
    assert rows["Bare"]["no_wards"] is True and rows["Bare"]["free"] == 0 and rows["Bare"]["warnings"]


def test_an_archived_ward_cannot_be_chosen_by_hand(world):
    facility, manager, wards, _ = world.facilities[2]
    world.request_all(2, world.placements[:1])
    Ward.objects.filter(id=wards[0].id).update(archived_at=timezone.now())
    with pytest.raises(errors.InvalidTransition):
        services.allocate_ward(world.placements[0].id, wards[0].id, actor=manager)
    plan = allocation.plan_auto_arrange(actor=manager, seed="archive1")
    assert plan["summary"]["arranged"] == 0 and plan["unplaced"][0]["reason"] == "This facility has no active wards."


def test_wards_and_mentors_basis_caps_a_facility_at_its_mentor_places():
    world = World(students=12, mentors_per=1, max_active=2)  # each facility can mentor only 2 students
    plan = allocation.plan_facility_split(actor=world.coordinator, placement_ids=[p.id for p in world.placements], facility_ids=world.facility_ids, basis="wards_and_mentors", seed="mentors1")
    assert {f["name"]: f["requested"] for f in plan["facilities"]} == {"Facility 0": 2, "Facility 1": 2, "Facility 2": 2}
    assert len(plan["unplaced"]) == 6


def test_pending_requests_are_reported_and_can_be_netted_off(world):
    other, cohort, created = world.second_school(students=10)
    allocation.request_facility(actor=other, placement_ids=[p.id for p in created], facility_id=world.facilities[2][0].id)  # 10 asked for 4 places
    row = {r["name"]: r for r in capacity.facility_capacity(program_id=world.program.id, start=world.start, end=world.end)}["Facility 2"]
    assert row["pending_requests"] == 10 and row["free"] == 4 and any("10 students are already requested for 4 free places" in w for w in row["warnings"])
    ids = [p.id for p in world.placements[:6]]
    gross = allocation.plan_facility_split(actor=world.coordinator, placement_ids=ids, facility_ids=[world.facilities[2][0].id], seed="netpend1")
    net = allocation.plan_facility_split(actor=world.coordinator, placement_ids=ids, facility_ids=[world.facilities[2][0].id], seed="netpend1", net_of_pending=True)
    assert gross["facilities"][0]["requested"] == 4 and net["facilities"][0]["requested"] == 0


# ------------------------------------------------------------------ arrangement at scale, parity, determinism


def test_sixty_students_are_arranged_correctly_within_budget():
    world = World(students=60, ward_caps=((14, 14), (10, 10), (8,)), mentors_per=4, max_active=6)
    split = allocation.apply_facility_split(actor=world.coordinator, placement_ids=[p.id for p in world.placements], facility_ids=world.facility_ids, seed="sixty001")
    assert split["requested"] == 56 and len(split["unplaced"]) == 4  # 28 + 20 + 8 places in total
    totals = {}
    for index, (facility, nm, wards, mentors) in enumerate(world.facilities):
        queue = allocation.incoming(actor=nm).count()
        with CaptureQueriesContext(connection) as plan_queries:
            plan = allocation.plan_auto_arrange(actor=nm, seed="arrange1")
        assert len(plan_queries) <= 15, "planning must not issue queries per student"
        started = time.perf_counter()
        result = allocation.apply_auto_arrange(actor=nm, seed="arrange1", expected_plan_hash=plan["plan_hash"])
        elapsed = time.perf_counter() - started
        assert elapsed < 30, f"arranging {queue} students took {elapsed:.1f}s"
        # Preview parity: apply did exactly what the plan showed.
        assert [(r["placement_id"], r["ward"]["id"], (r["mentor"] or {}).get("id")) for r in result["arranged"]] == \
               [(r["placement_id"], r["ward"]["id"], (r["mentor"] or {}).get("id")) for r in plan["assignments"]]
        assert result["unplaced"] == [] and result["summary"]["arranged"] == queue
        totals[facility.name] = queue
        # No ward above its capacity; students spread across the wards (balanced), mentors within their limit.
        for ward in wards:
            held = WardAssignment.objects.filter(ward=ward, ended_at=None).count()
            assert held <= ward.max_students
        counts = [WardAssignment.objects.filter(ward=ward, ended_at=None).count() for ward in wards]
        assert max(counts) - min(counts) <= 1
        for mentor in mentors:
            assert MentorAssignment.objects.filter(mentor=mentor, ended_at=None).count() <= mentor.max_active_placements
    assert totals == {"Facility 0": 28, "Facility 1": 20, "Facility 2": 8}


def test_same_seed_gives_the_same_arrangement_and_a_changed_world_is_refused(world):
    manager = world.facilities[0][1]
    world.request_all(0, world.placements[:12])
    first = allocation.plan_auto_arrange(actor=manager, seed="repeat01")
    second = allocation.plan_auto_arrange(actor=manager, seed="repeat01")
    other = allocation.plan_auto_arrange(actor=manager, seed="repeat02")
    assert first["plan_hash"] == second["plan_hash"] and first["assignments"] == second["assignments"]
    assert [r["placement_id"] for r in first["assignments"]] != [r["placement_id"] for r in other["assignments"]]
    # Someone adds a student to the queue after the manager reviewed the preview.
    world.request_all(0, world.placements[12:13])
    with pytest.raises(errors.InvalidTransition):
        allocation.apply_auto_arrange(actor=manager, seed="repeat01", expected_plan_hash=first["plan_hash"])
    assert not WardAssignment.objects.filter(ended_at=None).exists()


def test_facility_split_preview_matches_what_is_recorded_and_stale_hash_is_refused(world):
    ids = [p.id for p in world.placements[:20]]
    plan = allocation.plan_facility_split(actor=world.coordinator, placement_ids=ids, facility_ids=world.facility_ids, seed="splitseed")
    with pytest.raises(errors.InvalidTransition):
        allocation.apply_facility_split(actor=world.coordinator, placement_ids=ids, facility_ids=world.facility_ids, seed="splitseed", expected_plan_hash="0" * 64)
    result = allocation.apply_facility_split(actor=world.coordinator, placement_ids=ids, facility_ids=world.facility_ids, seed="splitseed", expected_plan_hash=plan["plan_hash"])
    recorded = {str(p.id): str(p.requested_facility_id) for p in Placement.objects.filter(id__in=ids)}
    assert recorded == {a["placement_id"]: a["facility_id"] for a in plan["assignments"]} and result["requested"] == 20


def test_balancing_across_wards_and_mentors_is_even(world):
    facility, manager, wards, mentors = world.facilities[0]
    world.request_all(0, world.placements[:16])
    result = allocation.apply_auto_arrange(actor=manager, seed="balance1")
    per_ward = [WardAssignment.objects.filter(ward=w, ended_at=None).count() for w in wards]
    per_mentor = [MentorAssignment.objects.filter(mentor=m, ended_at=None).count() for m in mentors]
    assert per_ward == [8, 8] and sorted(per_mentor) == [5, 5, 5] and result["summary"]["without_mentor"] == 1
    assert {m["assigned"] for m in result["mentors"]} == {5}


# ------------------------------------------------------------------ partial results, reasons, retry, undo


def test_unplaced_students_carry_reasons_and_can_be_retried_after_capacity_is_added():
    world = World(students=15, ward_caps=((5, 5),), mentors_per=4, max_active=6)
    facility, manager, wards, _ = world.facilities[0]
    world.request_all(0)
    result = allocation.apply_auto_arrange(actor=manager, seed="partial1")
    assert result["summary"] == {**result["summary"], "arranged": 10, "unplaced": 5}
    assert {r["reason"] for r in result["unplaced"]} == {"Every ward is full for these dates."}
    run = AllocationRun.objects.get(id=result["run_id"])
    assert run.status == "partial"
    detail = allocation_results.run_detail(actor=manager, run_id=run.id)
    assert detail["summary"]["unplaced_reasons"] == [{"reason": "Every ward is full for these dates.", "count": 5}]
    assert detail["run"]["can_retry"] is True
    # Wards are extended, then the unplaced students are retried: they are placed and the old run stops offering a retry.
    Ward.objects.filter(id=wards[0].id).update(max_students=8)
    Ward.objects.filter(id=wards[1].id).update(max_students=7)
    retry = allocation.retry_unplaced(actor=manager, run_id=run.id)
    assert retry["summary"]["arranged"] == 5 and retry["unplaced"] == []
    assert allocation_results.run_detail(actor=manager, run_id=run.id)["run"]["can_retry"] is False
    assert Placement.objects.filter(requested_facility=facility, facility_id=None).count() == 0


def test_mentor_rules_are_respected_and_a_missing_mentor_is_an_issue_not_a_failure():
    world = World(students=6, ward_caps=((10,),), mentors_per=3, max_active=2)
    facility, manager, wards, mentors = world.facilities[0]
    User.objects.filter(id=mentors[0].id).update(accepting_students=False)  # not accepting
    # mentors[1] is already at their limit (2 open placements), mentors[2] has room for 2.
    others = world.add_students(2, prefix="x")
    extra = world.create_placements(others, start=START - dt.timedelta(days=100), end=START - dt.timedelta(days=50))
    for placement in extra:
        services.allocate_ward(placement.id, wards[0].id, actor=manager)
        services.assign_mentor(placement.id, mentors[1].id, actor=manager)
    world.request_all(0, world.placements[:6])
    plan = allocation.plan_auto_arrange(actor=manager, seed="mentor001")
    assigned = [r["mentor"]["id"] for r in plan["assignments"] if r["mentor"]]
    assert set(assigned) == {str(mentors[2].id)} and len(assigned) == 2  # only the one mentor with room, up to their limit
    assert sum(1 for r in plan["assignments"] if not r["mentor"]) == 4
    assert all("No mentor has capacity left" in r["issues"][0] for r in plan["assignments"] if not r["mentor"])
    result = allocation.apply_auto_arrange(actor=manager, seed="mentor001", expected_plan_hash=plan["plan_hash"])
    assert result["summary"]["arranged"] == 6 and result["summary"]["without_mentor"] == 4
    assert Placement.objects.filter(id__in=[p.id for p in world.placements[:6]], state=State.SCHEDULED).count() == 2
    rows = {r["student"]["id"]: r for r in planning.cohort_students(actor=world.coordinator, cohort_id=world.cohort.id, status="partly_arranged")["results"]}
    assert len(rows) == 4


def test_untrained_mentors_are_used_last_and_block_release_with_a_reason():
    world = World(students=4, ward_caps=((10,),), mentors_per=2, max_active=5)
    facility, manager, wards, mentors = world.facilities[0]
    module = TrainingModule.objects.create(program=world.program, title="Required", slug="required", is_required=True, is_published=True, visible_roles=["mentor"])
    assert module.is_required
    world.request_all(0)
    plan = allocation.plan_auto_arrange(actor=manager, seed="untrained")
    assert all("has not finished required training" in r["issues"][0] for r in plan["assignments"])
    allocation.apply_auto_arrange(actor=manager, seed="untrained")
    release = planning.release_placements(actor=world.coordinator, cohort_id=world.cohort.id)
    assert release["released"] == 0 and len(release["blocked"]) == 4
    assert planning.cohort_students(actor=world.coordinator, cohort_id=world.cohort.id)["counts"]["ready_to_release"] == 0


def test_a_student_already_arranged_by_someone_else_is_left_alone(world, monkeypatch):
    facility, manager, wards, mentors = world.facilities[0]
    world.request_all(0, world.placements[:3])
    plan = allocation.plan_auto_arrange(actor=manager, seed="raceseed")
    victim_row = plan["assignments"][-1]  # the last student of the plan
    other_ward = next(w for w in wards if str(w.id) != victim_row["ward"]["id"])
    real = services.allocate_ward
    calls = {"n": 0}

    def racing(placement_id, ward_id, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:  # a second manager arranges the last student into the OTHER ward while we work
            real(UUID(victim_row["placement_id"]), other_ward.id, actor=manager)
        return real(placement_id, ward_id, **kwargs)

    monkeypatch.setattr(services, "allocate_ward", racing)
    result = allocation.apply_auto_arrange(actor=manager, seed="raceseed")
    assert result["summary"]["arranged"] == 2 and result["summary"]["unplaced"] == 1
    skipped = result["unplaced"][0]
    assert skipped["placement_id"] == victim_row["placement_id"] and "left as it is" in skipped["reason"]
    # The other manager's choice stands: one ward row, the ward they chose, no mentor row created twice.
    assert list(WardAssignment.objects.filter(placement_id=victim_row["placement_id"], ended_at=None).values_list("ward_id", flat=True)) == [other_ward.id]
    assert MentorAssignment.objects.filter(placement_id=victim_row["placement_id"], ended_at=None).count() == 0
    assert AllocationRun.objects.get(id=result["run_id"]).status == "partial"


def test_one_students_unexpected_failure_does_not_abandon_the_others(world, monkeypatch):
    facility, manager, wards, mentors = world.facilities[0]
    world.request_all(0, world.placements[:5])
    real = services.assign_mentor
    seen = {"n": 0}

    def flaky(placement_id, mentor_id, **kwargs):
        seen["n"] += 1
        if seen["n"] == 2:
            raise RuntimeError("database hiccup")
        return real(placement_id, mentor_id, **kwargs)

    monkeypatch.setattr(services, "assign_mentor", flaky)
    result = allocation.apply_auto_arrange(actor=manager, seed="flaky001")
    assert result["summary"]["arranged"] == 4 and result["summary"]["unplaced"] == 1
    assert "unexpected problem" in result["unplaced"][0]["reason"]
    # The failed student was rolled back completely (still waiting in the queue), not left half arranged.
    failed = Placement.objects.get(id=result["unplaced"][0]["placement_id"])
    assert failed.state == State.DRAFT and failed.facility_id is None and failed.requested_facility_id == facility.id
    assert not WardAssignment.objects.filter(placement=failed).exists()
    assert AllocationRun.objects.get(id=result["run_id"]).status == "partial"  # never left "running"


def test_undo_returns_students_to_the_queue_and_leaves_moved_on_students_alone(world):
    facility, manager, wards, mentors = world.facilities[0]
    world.request_all(0, world.placements[:6])
    result = allocation.apply_auto_arrange(actor=manager, seed="undo0001")
    released_one = Placement.objects.get(id=result["arranged"][0]["placement_id"])
    if released_one.state == State.SCHEDULED:
        services.transition(released_one.id, State.AWAITING_STUDENT, actor=world.coordinator)
    undone = allocation.undo_auto_arrange(actor=manager, run_id=result["run_id"])
    assert undone["reverted"] == 5 and len(undone["kept"]) == 1
    assert allocation.incoming(actor=manager).count() == 5
    assert AllocationRun.objects.get(id=result["run_id"]).status == "undone"
    with pytest.raises(errors.InvalidTransition):
        allocation.undo_auto_arrange(actor=manager, run_id=result["run_id"])
    # Arranging again works.
    again = allocation.apply_auto_arrange(actor=manager, seed="undo0002")
    assert again["summary"]["arranged"] == 5


def test_arranging_nothing_is_a_clear_error_not_an_empty_run(world):
    with pytest.raises(errors.InvalidTransition):
        allocation.apply_auto_arrange(actor=world.facilities[0][1], seed="nothing1")
    assert AllocationRun.objects.count() == 0


def test_idempotent_replays_return_the_real_result(world):
    manager = world.facilities[0][1]
    key = str(uuid.uuid4())
    body = {"placement_ids": [str(p.id) for p in world.placements[:5]], "facility_ids": [str(world.facility_ids[0])]}
    first = api(world.coordinator).post("/api/v1/placements/facility-requests", body, format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS)
    second = api(world.coordinator).post("/api/v1/placements/facility-requests", body, format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS)
    assert first.status_code == 201 and second.json()["meta"]["idempotency_replayed"] is True
    assert second.json()["data"]["requested"] == 5 and second.json()["data"]["run_id"] == first.json()["data"]["run_id"]
    key2 = str(uuid.uuid4())
    arrange = {"seed": "replay001"}
    a = api(manager).post("/api/v1/placements/auto-arrange", arrange, format="json", HTTP_IDEMPOTENCY_KEY=key2, **HEADERS)
    b = api(manager).post("/api/v1/placements/auto-arrange", arrange, format="json", HTTP_IDEMPOTENCY_KEY=key2, **HEADERS)
    assert a.status_code == 201 and b.json()["data"]["summary"] == a.json()["data"]["summary"]
    assert AllocationRun.objects.filter(mode="auto_arrange").count() == 1


# ------------------------------------------------------------------ concurrency under lock


@pytest.mark.django_db(transaction=True)
def test_two_managers_cannot_both_take_a_mentors_last_place():
    world = World(students=2, ward_caps=((10,),), mentors_per=1, max_active=1)
    facility, manager, wards, mentors = world.facilities[0]
    world.request_all(0)
    for placement in world.placements:
        services.allocate_ward(placement.id, wards[0].id, actor=manager)
    barrier = threading.Barrier(2)
    outcomes = []

    def worker(placement):
        try:
            barrier.wait(timeout=5)
            services.assign_mentor(placement.id, mentors[0].id, actor=manager)
            outcomes.append("ok")
        except errors.DomainError:
            outcomes.append("refused")
        finally:
            connection.close()

    threads = [threading.Thread(target=worker, args=(p,)) for p in world.placements]
    [t.start() for t in threads]
    [t.join(timeout=20) for t in threads]
    assert sorted(outcomes) == ["ok", "refused"]
    assert MentorAssignment.objects.filter(mentor=mentors[0], ended_at=None).count() == 1


@pytest.mark.django_db(transaction=True)
def test_ward_capacity_holds_under_concurrent_admission():
    world = World(students=3, ward_caps=((1,),), mentors_per=1)
    facility, manager, wards, mentors = world.facilities[0]
    world.request_all(0)
    barrier = threading.Barrier(3)
    outcomes = []

    def worker(placement):
        try:
            barrier.wait(timeout=5)
            services.allocate_ward(placement.id, wards[0].id, actor=manager)
            outcomes.append("ok")
        except errors.DomainError:
            outcomes.append("refused")
        finally:
            connection.close()

    threads = [threading.Thread(target=worker, args=(p,)) for p in world.placements]
    [t.start() for t in threads]
    [t.join(timeout=20) for t in threads]
    assert sorted(outcomes) == ["ok", "refused", "refused"]
    assert WardAssignment.objects.filter(ward=wards[0], ended_at=None).count() == 1


# ------------------------------------------------------------------ student holds (just-fixed rules still apply here)


def test_finished_placements_do_not_block_a_new_batch_but_live_ones_do(world):
    student = world.students[0]
    live = StudentAssignment.objects.get(student=student, ended_at=None).placement
    # A live overlapping placement is skipped with a reason.
    again = services.bulk_create_placements(services.BulkCreatePlacements(
        cohort_id=world.cohort.id, student_ids=[student.id], planned_start=world.start, planned_end=world.end), actor=world.coordinator)
    assert again["created"] == [] and again["skipped"][0]["reason"] == "overlapping_placement"
    # Once withdrawn it holds nothing, so the student can be placed again for the same dates.
    services.transition(live.id, State.WITHDRAWN, actor=world.coordinator, reason="student_withdrew")
    again = services.bulk_create_placements(services.BulkCreatePlacements(
        cohort_id=world.cohort.id, student_ids=[student.id], planned_start=world.start, planned_end=world.end), actor=world.coordinator)
    assert len(again["created"]) == 1 and again["skipped"] == []


# ------------------------------------------------------------------ planning overview API


def test_planning_overview_lists_the_next_cohort_first_with_counts(world):
    today = dt.date.today()
    Cohort.objects.create(institution=world.institution, name="Old cohort", start_date=today - dt.timedelta(days=120), end_date=today - dt.timedelta(days=1))
    Cohort.objects.create(institution=world.institution, name="Running cohort", start_date=today - dt.timedelta(days=5), end_date=today + dt.timedelta(days=50))
    Cohort.objects.create(institution=world.institution, name="Later cohort", start_date=today + dt.timedelta(days=200), end_date=today + dt.timedelta(days=300))
    body = get(world.coordinator, "placements/planning/overview").json()["data"]
    names = [c["name"] for c in body["cohorts"]]
    assert names == ["Cohort A", "Later cohort", "Running cohort"]  # soonest upcoming first, then under way; finished ones never
    first = body["cohorts"][0]
    assert first["phase"] == "upcoming" and first["days_until_start"] == 30 and body["next_cohort_id"] == first["id"]
    assert first["counts"]["total"] == 60 and first["counts"]["not_requested"] == 60 and first["counts"]["ready_to_release"] == 0
    assert [s["code"] for s in body["statuses"]][0] == "not_placed"


def build_pipeline(world):
    """Students in every stage of the pipeline, through the real services."""
    f0 = world.facilities[0]
    f1 = world.facilities[1]
    p = world.placements
    extra = world.add_students(3, prefix="n")  # enrolled, no placement yet
    world.request_all(0, p[0:10])
    world.request_all(1, p[10:14])
    allocation.apply_auto_arrange(actor=f0[1], seed="pipe0001", placement_ids=[x.id for x in p[0:6]])  # 6 arranged (scheduled)
    allocation.decline_requests(actor=f1[1], placement_ids=[x.id for x in p[10:12]], reason="No space on the labour ward")
    return extra


def test_planning_students_shows_every_stage_with_where_each_student_is(world):
    extra = build_pipeline(world)
    coordinator = world.coordinator
    notices_result = None
    from apps.placements import notices

    shared_ids = [p.id for p in world.placements[0:2]]
    notices_result = notices.share_with_students(actor=coordinator, placement_ids=shared_ids)
    assert notices_result["sent"] == 2
    services.transition(world.placements[2].id, State.AWAITING_STUDENT, actor=coordinator)

    data = planning.cohort_students(actor=coordinator, cohort_id=world.cohort.id, page_size=100)
    counts = data["counts"]
    assert counts["total"] == 63 and counts["not_placed"] == 3
    assert counts["shared"] == 2 and counts["released"] == 1 and counts["arranged"] == 3
    assert counts["requested"] == 4 + 2 and counts["declined"] == 2 and counts["not_requested"] == 60 - 10 - 4
    assert sum(counts[code] for code, *_ in planning.STATUSES) == 63
    row = next(r for r in data["results"] if r["placement_id"] == str(world.placements[0].id))
    assert row["status"] == "shared" and row["facility"]["name"] == "Facility 0" and row["ward"] and row["mentor"]
    assert row["planned_start"] == START and row["planned_end"] == END and row["shared_at"]
    declined = next(r for r in data["results"] if r["status"] == "declined")
    assert declined["declined"]["reason"] == "No space on the labour ward" and declined["declined"]["facility"] == "Facility 1"
    requested = next(r for r in data["results"] if r["status"] == "requested")
    assert requested["requested_facility"]["name"] and requested["requested_at"]
    assert all(r["placement_id"] is None for r in data["results"] if r["status"] == "not_placed")
    assert {r["student"]["id"] for r in data["results"] if r["status"] == "not_placed"} == {str(s.id) for s in extra}


def test_planning_students_filters_search_sort_pagination_and_ids(world):
    build_pipeline(world)
    coordinator, cohort = world.coordinator, world.cohort
    page1 = planning.cohort_students(actor=coordinator, cohort_id=cohort.id, page=1, page_size=20)
    page4 = planning.cohort_students(actor=coordinator, cohort_id=cohort.id, page=4, page_size=20)
    assert page1["pagination"] == {"page": 1, "page_size": 20, "total_count": 63, "total_pages": 4, "has_next": True, "has_previous": False}
    assert len(page4["results"]) == 3 and page4["pagination"]["has_next"] is False
    only = planning.cohort_students(actor=coordinator, cohort_id=cohort.id, status="declined,requested")
    assert {r["status"] for r in only["results"]} == {"declined", "requested"} and only["pagination"]["total_count"] == 8
    assert only["counts"]["total"] == 63  # counts always describe the whole cohort
    ready = planning.cohort_students(actor=coordinator, cohort_id=cohort.id, ready=True)
    assert ready["pagination"]["total_count"] == 6 and all(r["ready_to_release"] for r in ready["results"])
    by_facility = planning.cohort_students(actor=coordinator, cohort_id=cohort.id, facility_id=str(world.facilities[1][0].id))
    assert by_facility["pagination"]["total_count"] == 2  # 4 were requested of Facility 1, 2 of them were declined
    everyone = planning.cohort_students(actor=coordinator, cohort_id=cohort.id, page_size=100)["results"]
    ward = next(r["ward"]["id"] for r in everyone if r["ward"])
    by_ward = planning.cohort_students(actor=coordinator, cohort_id=cohort.id, ward_id=ward, page_size=100)
    assert by_ward["results"] and {r["ward"]["id"] for r in by_ward["results"]} == {ward}
    assert by_ward["pagination"]["total_count"] == sum(1 for r in everyone if r["ward"] and r["ward"]["id"] == ward)
    found = planning.cohort_students(actor=coordinator, cohort_id=cohort.id, search="reg/0007")
    assert [r["student"]["registration_number"] for r in found["results"]] == ["REG/0007"]
    by_name = planning.cohort_students(actor=coordinator, cohort_id=cohort.id, sort="name", order="desc", page_size=100)["results"]
    names = [r["student"]["name"].lower() for r in by_name]
    assert names == sorted(names, reverse=True)
    by_status = planning.cohort_students(actor=coordinator, cohort_id=cohort.id, sort="status", page_size=100)["results"]
    assert by_status[0]["status"] == "not_placed"
    ids = planning.cohort_students(actor=coordinator, cohort_id=cohort.id, status="not_requested", ids_only=True)
    assert ids["count"] == 46 and len(ids["placement_ids"]) == 46
    attention = planning.cohort_students(actor=coordinator, cohort_id=cohort.id, needs_attention=True)
    assert attention["pagination"]["total_count"] == 3 + 2 + 46
    with pytest.raises(errors.InvalidTransition):
        planning.cohort_students(actor=coordinator, cohort_id=cohort.id, status="nonsense")


def test_planning_http_endpoints_and_query_validation(world):
    path = f"placements/planning/cohorts/{world.cohort.id}/students"
    ok = get(world.coordinator, f"{path}?status=not_requested&page_size=10&sort=name")
    assert ok.status_code == 200 and len(ok.json()["data"]["results"]) == 10
    assert get(world.coordinator, f"{path}?sort=bogus").status_code == 400
    assert get(world.coordinator, f"{path}?page_size=1000").status_code == 400
    summary = get(world.coordinator, f"placements/planning/cohorts/{world.cohort.id}").json()["data"]
    assert summary["cohort"]["counts"]["total"] == 60


def test_planning_is_scoped_to_the_coordinators_institution(world):
    other, other_cohort, _ = world.second_school(students=2)
    # The other school's coordinator cannot read this cohort, and sees only their own cohort in the overview.
    assert get(other, f"placements/planning/cohorts/{world.cohort.id}/students").status_code == 404
    assert get(other, f"placements/planning/cohorts/{world.cohort.id}").status_code == 404
    names = [c["name"] for c in get(other, "placements/planning/overview").json()["data"]["cohorts"]]
    assert names == ["Cohort B"]
    # Nurse managers, mentors and students have no planning view at all (a denied capability answers "not found").
    for user in (world.facilities[0][1], world.students[0], world.facilities[0][3][0]):
        assert get(user, "placements/planning/overview").status_code == 404
    # A programme admin sees any institution, and can narrow to one.
    admin = make_user(world.program, Role.PROGRAM_ADMIN, "admin@a.org")
    seen = {c["name"] for c in get(admin, "placements/planning/overview").json()["data"]["cohorts"]}
    assert seen == {"Cohort A", "Cohort B"}
    narrowed = get(admin, f"placements/planning/overview?institution_id={other_cohort.institution_id}").json()["data"]["cohorts"]
    assert [c["name"] for c in narrowed] == ["Cohort B"]
    # Another programme's data is invisible even with a valid id.
    stranger_program = Program.objects.create(name="Elsewhere")
    stranger = make_user(stranger_program, Role.PROGRAM_ADMIN, "admin@elsewhere.org")
    assert get(stranger, f"placements/planning/cohorts/{world.cohort.id}/students").status_code == 404


def test_cohort_summary_gives_capacity_context_across_all_facilities_and_warns(world):
    body = planning.cohort_summary(actor=world.coordinator, cohort_id=world.cohort.id)
    capacity_ctx = body["capacity"]
    assert body["window"]["basis"] == "placements" and body["window"]["start"] == START
    assert capacity_ctx["total_free"] == 36 and capacity_ctx["students_to_place"] == 60 and capacity_ctx["shortfall"] == 24
    assert [f["name"] for f in capacity_ctx["facilities"]] == ["Facility 0", "Facility 1", "Facility 2"]
    ward_rows = capacity_ctx["facilities"][0]["wards"]
    assert [(w["capacity"], w["occupied"], w["free"]) for w in ward_rows] == [(10, 0, 10), (10, 0, 10)]
    assert body["warnings"] and "36 free places" in body["warnings"][0]
    # Facilities with no wards or no mentor room say why.
    Facility.objects.create(program=world.program, name="Newly added")
    again = planning.cohort_summary(actor=world.coordinator, cohort_id=world.cohort.id)["capacity"]["facilities"]
    assert next(f for f in again if f["name"] == "Newly added")["no_wards"] is True


def test_planning_students_query_count_does_not_grow_with_the_cohort(world):
    with CaptureQueriesContext(connection) as small:
        planning.cohort_students(actor=world.coordinator, cohort_id=world.cohort.id, page_size=100)
    world.add_students(40, prefix="more")
    world.create_placements(world.students[60:])
    with CaptureQueriesContext(connection) as large:
        data = planning.cohort_students(actor=world.coordinator, cohort_id=world.cohort.id, page_size=100)
    assert data["counts"]["total"] == 100 and len(large) <= len(small) + 3


# ------------------------------------------------------------------ release in bulk


def test_bulk_release_reports_each_student_and_is_safe_to_repeat(world):
    f0 = world.facilities[0]
    world.request_all(0, world.placements[:8])
    allocation.apply_auto_arrange(actor=f0[1], seed="release01")
    before = OutboxEvent.objects.filter(event_type="PlacementInvitationIssued").count()
    response = post(world.coordinator, "placements/release", {"cohort_id": str(world.cohort.id)})
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total"] == 60 and data["released"] == 8 + 0 and data["already_released"] == 0 and data["not_arranged"] == 52 and data["blocked"] == []
    assert OutboxEvent.objects.filter(event_type="PlacementInvitationIssued").count() == before + 8
    assert Placement.objects.filter(state=State.AWAITING_STUDENT).count() == 8
    again = post(world.coordinator, "placements/release", {"cohort_id": str(world.cohort.id)}).json()["data"]
    assert again["released"] == 0 and again["already_released"] == 8
    # A specific selection works, and an empty request is refused.
    assert post(world.coordinator, "placements/release", {}).status_code == 400
    nobody = post(world.facilities[0][1], "placements/release", {"cohort_id": str(world.cohort.id)})
    assert nobody.status_code == 404
    other, _, _ = world.second_school(students=1)
    assert post(other, "placements/release", {"cohort_id": str(world.cohort.id)}).json()["data"]["total"] == 0  # never another school's students


# ------------------------------------------------------------------ allocation result API and download


def arrange_for_results():
    world = World(students=30, ward_caps=((6, 6), (4,)), mentors_per=2, max_active=5)
    coordinator_b, cohort_b, created_b = world.second_school(students=6)
    manager = world.facilities[0][1]
    world.request_all(0, world.placements[:16])
    allocation.request_facility(actor=coordinator_b, placement_ids=[p.id for p in created_b], facility_id=world.facilities[0][0].id)
    result = allocation.apply_auto_arrange(actor=manager, seed="results1")
    return world, coordinator_b, result


def test_run_result_has_summary_fill_mentor_spread_and_every_student():
    world, coordinator_b, result = arrange_for_results()
    manager = world.facilities[0][1]
    body = get(manager, f"placements/allocation-runs/{result['run_id']}").json()["data"]
    assert body["run"]["mode"] == "auto_arrange" and body["run"]["status"] == "partial" and body["run"]["can_undo"] and body["run"]["can_retry"]
    assert body["summary"]["requested"] == 22 and body["summary"]["placed"] == 12 and body["summary"]["unplaced"] == 10
    assert body["summary"]["unplaced_reasons"] == [{"reason": "Every ward is full for these dates.", "count": 10}]
    fill = body["facilities"][0]
    assert (fill["capacity"], fill["before"], fill["added"], fill["after"], fill["free_after"]) == (12, 0, 12, 12, 0)
    assert [(w["capacity"], w["before"], w["added"], w["after"]) for w in body["wards"]] == [(6, 0, 6, 6), (6, 0, 6, 6)]
    assert sum(m["assigned_in_run"] for m in body["mentors"]) == body["summary"]["with_mentor"] == 10  # 2 mentors x 5
    assert {m["limit"] for m in body["mentors"]} == {5} and all(m["remaining_now"] == 0 for m in body["mentors"])
    placed = [r for r in body["placements"] if r["outcome"] == "placed"]
    assert len(body["placements"]) == 22 and len(placed) == 12
    assert all(r["facility"]["name"] == "Facility 0" and r["ward"] and r["planned_start"] == START.isoformat() and not r["moved_since"] for r in placed)
    assert {r["status"] for r in placed} <= {"arranged", "partly_arranged"}
    # A later manual change is flagged, so the page never shows a stale arrangement as current.
    moved = next(r for r in placed if r["mentor"])
    other_mentor = next(m for m in world.facilities[0][3] if str(m.id) != moved["mentor"]["id"])
    User.objects.filter(id=other_mentor.id).update(max_active_placements=9)
    services.reassign_mentor(UUID(moved["placement_id"]), other_mentor.id, actor=manager, reason="swap")
    again = get(manager, f"placements/allocation-runs/{result['run_id']}").json()["data"]
    assert [r["student"] for r in again["placements"] if r["moved_since"]] == [moved["student"]]
    # Filters and paging on the result list.
    unplaced_only = get(manager, f"placements/allocation-runs/{result['run_id']}?outcome=unplaced&page_size=4").json()["data"]
    assert unplaced_only["pagination"]["total_count"] == 10 and len(unplaced_only["placements"]) == 4
    assert unplaced_only["summary"]["requested"] == 22  # the summary ignores filters


def test_run_result_is_scoped_for_coordinators_and_other_facilities():
    world, coordinator_b, result = arrange_for_results()
    run_id = result["run_id"]
    mine = get(world.coordinator, f"placements/allocation-runs/{run_id}").json()["data"]
    theirs = get(coordinator_b, f"placements/allocation-runs/{run_id}").json()["data"]
    assert mine["summary"]["requested"] + theirs["summary"]["requested"] == 22 and theirs["summary"]["requested"] == 6
    assert {r["cohort"] for r in mine["placements"]} == {"Cohort A"} and {r["cohort"] for r in theirs["placements"]} == {"Cohort B"}
    assert mine["run"]["can_undo"] is False and mine["run"]["can_retry"] is False  # read-only for coordinators
    assert get(world.facilities[1][1], f"placements/allocation-runs/{run_id}").status_code == 404  # another facility's manager
    outsider, _, _ = world.second_school(students=1, label="C")
    assert get(outsider, f"placements/allocation-runs/{run_id}").status_code == 404
    assert get(world.students[0], f"placements/allocation-runs/{run_id}").status_code == 404
    assert get(world.coordinator, f"placements/allocation-runs/{uuid.uuid4()}").status_code == 404


def test_run_lists_for_coordinators_and_managers_and_facility_split_results(world):
    manager = world.facilities[0][1]
    split = allocation.apply_facility_split(actor=world.coordinator, placement_ids=[p.id for p in world.placements[:30]], facility_ids=world.facility_ids, seed="listseed")
    allocation.apply_auto_arrange(actor=manager, seed="listarr1")
    coordinator_runs = get(world.coordinator, "placements/allocation-runs").json()["data"]
    assert {r["mode"] for r in coordinator_runs} == {"facility_split", "auto_arrange"} and all(not r["can_undo"] for r in coordinator_runs)
    assert [r["mode"] for r in get(manager, "placements/allocation-runs").json()["data"]] == ["auto_arrange"]
    only_splits = get(world.coordinator, "placements/allocation-runs?mode=facility_split").json()["data"]
    assert len(only_splits) == 1 and only_splits[0]["requested"] == 30
    detail = get(world.coordinator, f"placements/allocation-runs/{split['run_id']}").json()["data"]
    assert detail["run"]["mode"] == "facility_split" and detail["summary"]["placed"] == 30
    assert sum(f["requested"] for f in detail["facilities"]) == 30 and {f["name"] for f in detail["facilities"]} == {"Facility 0", "Facility 1", "Facility 2"}
    assert all(r["outcome"] == "requested" and r["facility"] for r in detail["placements"])  # live: Facility 0 has since arranged its share


def test_allocation_list_download_can_be_limited_to_one_run():
    world, coordinator_b, result = arrange_for_results()
    manager = world.facilities[0][1]
    response = api(manager).get(f"/api/v1/placements/allocation-list?file=csv&run_id={result['run_id']}", **HEADERS)
    assert response.status_code == 200 and response["Content-Type"].startswith("text/csv")
    lines = response.content.decode("utf-8-sig").strip().splitlines()
    assert lines[0].startswith("Student,Registration number,Cohort,Facility,Ward,Mentor,Dates,Status") and len(lines) == 1 + 22
    mine = api(world.coordinator).get(f"/api/v1/placements/allocation-list?file=csv&run_id={result['run_id']}", **HEADERS)
    assert len(mine.content.decode("utf-8-sig").strip().splitlines()) == 1 + 16  # only their own school's students
    xlsx = api(world.coordinator).get(f"/api/v1/placements/allocation-list?file=xlsx&run_id={result['run_id']}", **HEADERS)
    assert xlsx.status_code == 200 and xlsx.content[:2] == b"PK"
    assert api(world.coordinator).get(f"/api/v1/placements/allocation-list?file=csv&run_id={uuid.uuid4()}", **HEADERS).status_code == 404
    assert api(world.coordinator).get("/api/v1/placements/allocation-list?file=csv&run_id=not-a-uuid", **HEADERS).status_code == 409


def test_allocation_list_query_count_does_not_scale_with_students(world):
    with CaptureQueriesContext(connection) as queries:
        from apps.placements import allocation_list

        rows = allocation_list.rows_for(world.coordinator)
    assert len(rows) == 60 and len(queries) < 20


# ------------------------------------------------------------------ nurse manager incoming requests


def test_incoming_summary_groups_by_school_and_cohort_with_room_per_ward_and_warns(world):
    other, cohort_b, created_b = world.second_school(students=6)
    facility, manager, wards, mentors = world.facilities[2]  # 4 places in one ward
    world.request_all(2, world.placements[:5])
    allocation.request_facility(actor=other, placement_ids=[p.id for p in created_b], facility_id=facility.id)
    world.request_all(1, world.placements[5:9])  # another facility's queue
    body = get(manager, "placements/incoming/summary").json()["data"]
    assert body["total_requested"] == 11 and len(body["groups"]) == 2
    assert body["over_capacity"] is True and body["capacity"]["free"] == 4
    by_school = {g["institution"]["name"]: g for g in body["groups"]}
    a, b = by_school["School A"], by_school["School B"]
    assert (a["count"], a["cohort"]["name"], a["planned_start"], a["planned_end"]) == (5, "Cohort A", START.isoformat(), END.isoformat())
    assert (b["count"], b["cohort"]["name"]) == (6, "Cohort B")
    assert len(a["placement_ids"]) == 5 and a["requested_since"] and {s["name"] for s in a["students"]}
    assert a["capacity"]["wards"][0]["name"] == "Ward 2.0" and a["capacity"]["wards"][0]["free"] == 4 and a["capacity"]["free"] == 4
    assert a["over_capacity"] is True and a["shortfall"] == 1 and "5 students are requested but only 4 ward places are free" in a["warnings"][0]
    assert b["shortfall"] == 2
    # Nothing of the other facility's queue leaks in: only this facility's requested students are listed.
    requested_here = set(Placement.objects.filter(requested_facility=facility).values_list("id", flat=True))
    assert {UUID(pid) for g in body["groups"] for pid in g["placement_ids"]} == requested_here
    assert get(world.facilities[1][1], "placements/incoming/summary").json()["data"]["total_requested"] == 4
    # Roles without a facility queue are refused.
    assert get(world.coordinator, "placements/incoming/summary").status_code == 404
    assert get(world.students[0], "placements/incoming/summary").status_code == 404


def test_incoming_summary_shrinks_when_requests_are_accepted_or_declined(world):
    facility, manager, wards, mentors = world.facilities[0]
    world.request_all(0, world.placements[:10])
    assert get(manager, "placements/incoming/summary").json()["data"]["groups"][0]["over_capacity"] is False
    decline = post(manager, "placements/decline-requests", {"placement_ids": [str(p.id) for p in world.placements[:4]], "reason": "Ward closed for refurbishment"})
    assert decline.status_code == 200 and decline.json()["data"]["declined"] == 4
    event = OutboxEvent.objects.filter(event_type="PlacementsDeclined").latest("occurred_at")
    assert event.payload["count"] == 4 and event.payload["recipient_user_ids"] == [str(world.coordinator.id)]
    after = get(manager, "placements/incoming/summary").json()["data"]
    assert after["total_requested"] == 6
    arrange = post(manager, "placements/auto-arrange", {"placement_ids": after["groups"][0]["placement_ids"], "seed": "incoming1"})
    assert arrange.status_code == 201
    assert get(manager, "placements/incoming/summary").json()["data"]["total_requested"] == 0
    arranged_event = OutboxEvent.objects.filter(event_type="PlacementsArranged").latest("occurred_at")
    assert arranged_event.payload["arranged"] == 6 and arranged_event.payload["recipient_user_ids"] == [str(world.coordinator.id)]


def test_arranged_notifications_count_each_school_separately():
    world, coordinator_b, result = arrange_for_results()
    events = {tuple(e.payload["recipient_user_ids"]): e.payload for e in OutboxEvent.objects.filter(event_type="PlacementsArranged")}
    assert events[(str(world.coordinator.id),)]["arranged"] + events[(str(coordinator_b.id),)]["arranged"] == 12
    assert events[(str(coordinator_b.id),)]["arranged"] + events[(str(coordinator_b.id),)]["unplaced"] == 6


def test_cohort_auto_request_creates_missing_placements_and_shares_everyone_in_one_step(world):
    extra = world.add_students(3, prefix="n")  # enrolled with no placement yet
    coordinator, cohort = world.coordinator, world.cohort
    path = f"placements/planning/cohorts/{cohort.id}/auto-request"
    before = Placement.objects.count()

    preview = post(coordinator, path, {"preview": True, "mode": "even", "seed": "auto0001"})
    assert preview.status_code == 200, preview.content
    plan = preview.json()["data"]
    assert plan["candidates"] == 63 and plan["to_create"] == 3 and len(plan["assignments"]) == 63 and not plan["unplaced"]
    assert Placement.objects.count() == before  # a preview writes nothing
    again = post(coordinator, path, {"preview": True, "mode": "even", "seed": "auto0001"}).json()["data"]
    assert again["plan_hash"] == plan["plan_hash"]  # the same shuffle code gives the same split

    applied = post(coordinator, path, {"mode": "even", "seed": "auto0001", "expected_plan_hash": plan["plan_hash"]})
    assert applied.status_code == 201, applied.content
    body = applied.json()["data"]
    assert body["requested"] == 63 and sum(body["by_facility"].values()) == 63
    assert Placement.objects.count() == before + 3
    counts = planning.cohort_students(actor=coordinator, cohort_id=cohort.id, page_size=100)["counts"]
    assert counts["not_placed"] == 0 and counts["not_requested"] == 0 and counts["requested"] == 63
    assert {StudentAssignment.objects.get(placement=p).student_id for p in Placement.objects.filter(requested_facility__isnull=False, cohort=cohort)} >= {s.id for s in extra}

    nothing_left = post(coordinator, path, {"preview": True})
    assert nothing_left.status_code in (400, 409, 422)


def test_cohort_auto_request_in_capacity_mode_leaves_students_without_room_unplaced_and_creates_nothing_for_them(world):
    extra = world.add_students(3, prefix="n")
    coordinator, cohort = world.coordinator, world.cohort
    path = f"placements/planning/cohorts/{cohort.id}/auto-request"
    plan = post(coordinator, path, {"preview": True, "mode": "capacity", "seed": "auto0002"}).json()["data"]
    free = sum(f["usable_capacity"] for f in plan["facilities"])
    assert len(plan["assignments"]) == min(63, free) and len(plan["unplaced"]) == 63 - len(plan["assignments"])
    before = Placement.objects.count()
    body = post(coordinator, path, {"mode": "capacity", "seed": "auto0002", "expected_plan_hash": plan["plan_hash"]}).json()["data"]
    assert body["requested"] == len(plan["assignments"])
    made = Placement.objects.count() - before
    assert made == plan["to_create"] <= 3  # only students who were given a facility get a new placement
    assert AllocationRun.objects.filter(id=body["run_id"], mode=AllocationRun.Mode.FACILITY_SPLIT).exists()
    detail = get(coordinator, f"placements/allocation-runs/{body['run_id']}").json()["data"]
    assert detail["summary"]["unplaced"] == len(plan["unplaced"])  # students who got no placement still show on the result page
    assert detail["summary"]["requested"] == 63
    del extra


def test_cohort_auto_request_refuses_a_stale_plan_and_other_roles(world):
    coordinator, cohort = world.coordinator, world.cohort
    path = f"placements/planning/cohorts/{cohort.id}/auto-request"
    stale = post(coordinator, path, {"mode": "even", "seed": "auto0003", "expected_plan_hash": "0" * 64})
    assert stale.status_code in (400, 409, 422)
    manager = world.facilities[0][1]
    assert post(manager, path, {"preview": True}).status_code in (403, 404)
