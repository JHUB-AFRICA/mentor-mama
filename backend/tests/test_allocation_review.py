"""Review of the placement allocation work: regression tests for the problems found, the seeded demo story, and timings.

Run with the isolated wrapper only:  scripts/pytest-isolated.sh allocb tests/test_allocation_review.py -q
"""

from __future__ import annotations

import time
import uuid

import pytest
from django.core import mail
from django.core.management import call_command
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.identity.models import Program, Role, User
from apps.placements import allocation, planning
from apps.placements.models import AllocationRun, MentorAssignment, Placement, PlacementBatch, State, WardAssignment
from apps.facilities.models import Ward
from tests.test_allocation_enhancements import HEADERS, World, api, get, post

pytestmark = pytest.mark.django_db


# ------------------------------------------------------------------ regressions


def test_plan_does_not_call_a_mentor_untrained_when_the_programme_does_not_require_training():
    from apps.learning.models import TrainingModule

    world = World(students=4, ward_caps=((10,),), mentors_per=2, max_active=5)
    facility, manager, wards, mentors = world.facilities[0]
    TrainingModule.objects.create(program=world.program, title="Required", slug="required", is_required=True, is_published=True, visible_roles=["mentor"])
    world.request_all(0)
    assert all(r["issues"] for r in allocation.plan_auto_arrange(actor=manager, seed="flag0001")["assignments"])  # required: warned
    Program.objects.filter(id=world.program.id).update(require_mentor_training_before_placement=False)
    manager.refresh_from_db()
    plan = allocation.plan_auto_arrange(actor=manager, seed="flag0001")
    assert all(not r["issues"] and r["mentor"]["trained"] for r in plan["assignments"])  # not required: nothing to warn about


def test_a_coordinator_is_only_told_the_counts_for_their_own_students():
    world = World(students=10, ward_caps=((30,),), mentors_per=3, max_active=20)
    coordinator_b, cohort_b, created_b = world.second_school(students=6, label="B")
    world.request_all(0)
    allocation.request_facility(actor=coordinator_b, placement_ids=[p.id for p in created_b], facility_id=world.facilities[0][0].id)
    manager = world.facilities[0][1]
    allocation.apply_auto_arrange(actor=manager, seed="scopedcount")
    for user, expected in ((world.coordinator, 10), (coordinator_b, 6)):
        runs = get(user, "placements/allocation-runs?mode=auto_arrange").json()["data"]
        assert [r["arranged"] for r in runs] == [expected] and [r["unplaced"] for r in runs] == [0]
    assert get(manager, "placements/allocation-runs?mode=auto_arrange").json()["data"][0]["arranged"] == 16


def test_a_coordinator_cannot_read_the_facility_split_of_another_school():
    world = World(students=6, ward_caps=((30,),))
    coordinator_b, _, created_b = world.second_school(students=3, label="B")
    split = allocation.apply_facility_split(actor=coordinator_b, placement_ids=[p.id for p in created_b], facility_ids=world.facility_ids, seed="splitscope")
    assert get(world.coordinator, f"placements/allocation-runs/{split['run_id']}").status_code == 404
    assert get(world.coordinator, "placements/allocation-runs").json()["data"] == []


def test_replaying_a_retry_returns_the_real_result_not_an_empty_acknowledgement():
    world = World(students=15, ward_caps=((5,),), mentors_per=4, max_active=6)
    facility, manager, wards, _ = world.facilities[0]
    world.request_all(0)
    first = allocation.apply_auto_arrange(actor=manager, seed="retryrep1")
    assert first["summary"]["unplaced"] == 10
    Ward.objects.filter(id=wards[0].id).update(max_students=20)
    key, client = str(uuid.uuid4()), api(manager)
    url = f"/api/v1/placements/allocation-runs/{first['run_id']}/retry"
    one = client.post(url, {}, format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS)
    two = client.post(url, {}, format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS)
    assert one.status_code == 201 and one.json()["data"]["summary"]["arranged"] == 10
    assert two.json()["data"]["summary"] == one.json()["data"]["summary"] and two.json()["meta"]["idempotency_replayed"] is True


def test_many_placements_serialise_in_a_fixed_number_of_queries_with_identical_output():
    from apps.placements.serializers import PlacementSerializer

    small = World(students=4, ward_caps=((10,),), mentors_per=2, max_active=5)
    small.request_all(0)
    allocation.apply_auto_arrange(actor=small.facilities[0][1], seed="serial01")
    big = World(students=40, ward_caps=((60,),), mentors_per=4, max_active=20)
    big.request_all(0)
    allocation.apply_auto_arrange(actor=big.facilities[0][1], seed="serial02")
    counts = {}
    for name, world in (("small", small), ("big", big)):
        queryset = Placement.objects.filter(cohort=world.cohort).order_by("created_at")
        with CaptureQueriesContext(connection) as queries:
            many = PlacementSerializer(queryset, many=True).data
        counts[name] = len(queries)
        assert [dict(row) for row in many] == [dict(PlacementSerializer(p).data) for p in queryset]
        assert all(row["student"] and row["ward"] and row["mentor"] for row in many)
    assert counts["big"] == counts["small"] <= 10, counts


def test_batch_activity_is_an_empty_list_before_any_batch():
    world = World(students=6, ward_caps=((10,),))
    batches = get(world.coordinator, "placements/batches")
    assert batches.status_code == 200 and batches.json()["data"] == []  # nothing batched yet: an empty list, not an error


# ------------------------------------------------------------------ timings (printed with -s; bounds are generous)


@pytest.mark.parametrize("students", [60, 100])
def test_arranging_a_large_cohort_is_fast_and_balanced(students, capsys):
    world = World(students=students, ward_caps=((20, 20, 20, 20, 20),), mentors_per=10, max_active=12)
    facility, manager, wards, mentors = world.facilities[0]
    world.request_all(0)
    with CaptureQueriesContext(connection) as plan_queries:
        started = time.perf_counter()
        plan = allocation.plan_auto_arrange(actor=manager, seed="timing01")
        plan_seconds = time.perf_counter() - started
    started = time.perf_counter()
    result = allocation.apply_auto_arrange(actor=manager, seed="timing01", expected_plan_hash=plan["plan_hash"])
    apply_seconds = time.perf_counter() - started
    started = time.perf_counter()
    released = planning.release_placements(actor=world.coordinator, cohort_id=world.cohort.id)
    release_seconds = time.perf_counter() - started
    with capsys.disabled():
        print(f"\nTIMING students={students} plan={plan_seconds:.2f}s ({len(plan_queries)} queries) apply={apply_seconds:.2f}s release={release_seconds:.2f}s")
    assert released["released"] == students and released["blocked"] == []
    assert result["summary"]["arranged"] == students and result["unplaced"] == []
    counts = [WardAssignment.objects.filter(ward=w, ended_at=None).count() for w in wards]
    assert max(counts) - min(counts) <= 1
    per_mentor = [MentorAssignment.objects.filter(mentor=m, ended_at=None).count() for m in mentors]
    assert max(per_mentor) - min(per_mentor) <= 1 and max(per_mentor) <= 12
    assert plan_seconds < 5 and apply_seconds < 60 and len(plan_queries) <= 20


# ------------------------------------------------------------------ the seeded demo programme, read through the APIs

REAL_ADMIN = "presenter.admin@example.org"
REAL_STUDENT = "presenter.student@example.org"


def test_seed_is_quick_sends_nothing_and_tells_the_allocation_story(monkeypatch, settings, capsys):
    from django.contrib.auth import base_user, hashers

    hashed = []
    original = hashers.make_password

    def counting(*args, **kwargs):
        hashed.append(1)
        return original(*args, **kwargs)

    monkeypatch.setattr(hashers, "make_password", counting)
    monkeypatch.setattr(base_user, "make_password", counting)
    import apps.platform.management.commands.seed_demo as seed_module

    monkeypatch.setattr(seed_module, "make_password", counting)
    started = time.perf_counter()
    with CaptureQueriesContext(connection) as queries:
        call_command("seed_demo", admin_email=REAL_ADMIN, student_email=REAL_STUDENT, verbosity=0)
    seconds = time.perf_counter() - started
    with capsys.disabled():
        print(f"\nSEED seconds={seconds:.1f} queries={len(queries)} password_hashes={len(hashed)} users={User.objects.count()}")
    program = Program.objects.get(is_demo=True)
    assert mail.outbox == []
    assert len(hashed) < 60 and seconds < 120

    def coordinator_of(name_part):
        from apps.institutions.models import Cohort

        cohort = Cohort.objects.get(institution__program=program, name__icontains=name_part)
        return cohort, User.objects.filter(role=Role.COORDINATOR, institution_id=cohort.institution_id).first()

    first_cohort, peter = coordinator_of("Intake B")
    second_cohort, mercy = coordinator_of("Block 3")

    # Coordinator planning: the next cohort first, with students at every stage.
    overview = get(peter, "placements/planning/overview").json()["data"]
    assert overview["next_cohort_id"] == str(first_cohort.id)
    counts = overview["cohorts"][0]["counts"]
    with capsys.disabled():
        print("MSN counts", {k: v for k, v in counts.items() if v})
    assert 55 <= counts["total"] <= 60 and counts["not_placed"] >= 1 and counts["not_requested"] >= 1 and counts["declined"] >= 1
    assert counts["requested"] >= 1 and counts["arranged"] + counts["shared"] + counts["released"] >= 1 and counts["released"] >= 1
    assert get(mercy, "placements/planning/overview").json()["data"]["cohorts"][0]["counts"]["total"] == 25
    students = get(peter, f"placements/planning/cohorts/{first_cohort.id}/students?status=released,shared&page_size=100").json()["data"]
    assert students["results"] and all(r["planned_start"] for r in students["results"])

    # The nurse manager of the facility asked for the block sees INCOMING requests with a capacity warning.
    from apps.facilities.models import Facility

    greenville_id = Facility.objects.get(program=program, name__icontains="Greenville").id
    greenville = User.objects.get(role=Role.NURSE_MANAGER, facility_id=greenville_id)
    incoming = get(greenville, "placements/incoming/summary").json()["data"]
    with capsys.disabled():
        print("INCOMING", incoming["total_requested"], incoming["over_capacity"], [(g["cohort"]["name"], g["count"], g["capacity"]["free"], g["warnings"]) for g in incoming["groups"]])
    assert incoming["total_requested"] >= 10 and incoming["over_capacity"] and any(g["warnings"] for g in incoming["groups"])
    assert incoming["latest_run"] and incoming["latest_run"]["mode"] == "auto_arrange"

    # The second school: 25 students, a block requested of Lakeview and arranged by its own recorded run.
    second = get(mercy, "placements/planning/overview").json()["data"]["cohorts"][0]["counts"]
    with capsys.disabled():
        print("SECOND counts", {k: v for k, v in second.items() if v})
    assert second["total"] == 25 and second["not_placed"] >= 1 and second["not_requested"] >= 1 and second["requested"] >= 6 and second["shared"] >= 1
    lakeview = User.objects.get(role=Role.NURSE_MANAGER, facility_id=Facility.objects.get(program=program, name__icontains="Lakeview").id)
    assert get(lakeview, "placements/incoming/summary").json()["data"]["total_requested"] >= 6
    assert get(lakeview, "placements/allocation-runs?mode=auto_arrange").json()["data"][0]["arranged"] >= 1

    # The arrangement already made is a recorded run with unplaced students and reasons.
    run = AllocationRun.objects.filter(facility_id=greenville.facility_id, seed="demorun1").get()
    detail = get(peter, f"placements/allocation-runs/{run.id}").json()["data"]
    with capsys.disabled():
        print("RUN", detail["summary"], [(r["status"], r["reason"][:40]) for r in detail["placements"] if r["outcome"] == "unplaced"][:3])
    assert detail["summary"]["placed"] >= 1 and detail["summary"]["unplaced"] >= 1 and detail["summary"]["unplaced_reasons"]
    assert get(greenville, f"placements/allocation-runs/{run.id}").json()["data"]["run"]["can_retry"] is True

    # Batch activity is not empty for either coordinator.
    for coordinator in (peter, mercy):
        batches = get(coordinator, "placements/batches").json()["data"]
        assert batches and batches[0]["status"] == "completed" and batches[0]["created_count"] == len(batches[0]["created"]) > 0
        light = get(coordinator, "placements/batches?summary=1").json()["data"]
        assert light[0]["created"] == [] and light[0]["created_count"] == batches[0]["created_count"]
    assert PlacementBatch.objects.filter(actor_id=peter.id).count() >= 1

    # Released placements carry start dates and reached the student.
    assert Placement.objects.filter(cohort=first_cohort, state=State.AWAITING_STUDENT, planned_start__isnull=False).exists()

    # The hospital enlarged two wards after that run, so "retry unplaced" now places the students it could not.
    retried = post(greenville, f"placements/allocation-runs/{run.id}/retry", {})
    assert retried.status_code == 201 and retried.json()["data"]["summary"]["arranged"] >= 1
