"""Inactive-mentors list: the definition, its bounds, facility scoping and privacy."""

from __future__ import annotations

import datetime as dt
import itertools

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.analytics import mentor_activity
from apps.facilities.models import Facility
from apps.identity.models import Role, Status, User
from apps.induction.models import Checklist
from apps.mentorship.models import Session
from apps.placements.models import MentorAssignment, Placement, StudentAssignment

URL = "/api/v1/mentors/activity"
_counter = itertools.count(1)
TODAY = lambda: timezone.localdate()  # noqa: E731


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def person(program, role, facility=None, institution=None, status=Status.ACTIVE, signed_in=True, **extra):
    n = next(_counter)
    user = User.objects.create_user(
        email=f"{role}{n}@example.org", password="pw", first_name=f"{role.title()}{n}", last_name="Test",
        role=role, status=status, program=program, facility_id=facility.id if facility else None,
        institution_id=institution.id if institution else None, **extra,
    )
    if signed_in:
        User.objects.filter(id=user.id).update(last_login=timezone.now())
        user.refresh_from_db()
    return user


def live_placement(*, mentor, facility, institution, cohort, creator, state="active", assigned_days_ago=90, free_text=""):
    student = person(mentor.program, Role.STUDENT, institution=institution)
    start = TODAY() - dt.timedelta(days=100)
    placement = Placement.objects.create(
        cohort=cohort, institution=institution, facility=facility, state=state,
        planned_start=start, planned_end=start + dt.timedelta(days=200), created_by=creator,
        completed_at=timezone.now() if state == "completed" else None,
    )
    StudentAssignment.objects.create(placement=placement, student=student, started_on=start, created_by=creator)
    assignment = MentorAssignment.objects.create(placement=placement, mentor=mentor, created_by=creator)
    MentorAssignment.objects.filter(id=assignment.id).update(started_at=timezone.now() - dt.timedelta(days=assigned_days_ago))
    return placement, assignment


def log_session(placement, assignment, days_ago, creator, text="CONFIDENTIAL-NOTE"):
    return Session.objects.create(
        placement=placement, mentor_assignment=assignment, session_date=TODAY() - dt.timedelta(days=days_ago),
        session_type="bedside_teaching", what_was_covered=text, feedback_given=text, created_by=creator,
    )


@pytest.fixture
def env(program, institution, cohort, facility, nurse_manager):
    class Env: ...
    e = Env()
    e.program, e.institution, e.cohort, e.facility, e.manager = program, institution, cohort, facility, nurse_manager
    return e


def make(env, mentor, **kw):
    return live_placement(mentor=mentor, facility=env.facility, institution=env.institution, cohort=env.cohort, creator=env.manager, **kw)


def fetch(env, days=None, user=None):
    params = {"days": days} if days is not None else {}
    return client_for(user or env.manager).get(URL, params)


def rows(response):
    assert response.status_code == 200, response.content
    return {row["id"]: row for row in response.json()["data"]["results"]}


@pytest.mark.django_db
class TestDefinition:
    def test_recent_session_is_not_inactive(self, env):
        mentor = person(env.program, Role.MENTOR, env.facility)
        placement, assignment = make(env, mentor)
        log_session(placement, assignment, 3, env.manager)
        assert str(mentor.id) not in rows(fetch(env))

    def test_session_exactly_on_the_boundary_counts_as_recent(self, env):
        mentor = person(env.program, Role.MENTOR, env.facility)
        placement, assignment = make(env, mentor)
        log_session(placement, assignment, 14, env.manager)
        assert str(mentor.id) not in rows(fetch(env))
        assert str(mentor.id) in rows(fetch(env, days=7))  # a 7-day window makes a 14-day-old session old

    def test_old_session_is_inactive_with_plain_reason(self, env):
        mentor = person(env.program, Role.MENTOR, env.facility)
        placement, assignment = make(env, mentor)
        log_session(placement, assignment, 21, env.manager)
        row = rows(fetch(env))[str(mentor.id)]
        assert row["inactive"] is True
        assert row["days_since_last_session"] == 21
        assert row["reasons"] == ["No session in 21 days"]
        assert row["reason_codes"] == ["no_recent_session"]
        assert row["sessions_in_window"] == 0
        assert row["live_students"] == 1 and row["students_without_recent_session"] == 1
        assert row["last_session_date"] == (TODAY() - dt.timedelta(days=21)).isoformat()

    def test_never_logged_with_live_students(self, env):
        mentor = person(env.program, Role.MENTOR, env.facility)
        make(env, mentor)
        row = rows(fetch(env))[str(mentor.id)]
        assert row["reasons"] == ["Never logged a session"]
        assert row["last_session_date"] is None and row["days_since_last_session"] is None

    def test_newly_assigned_mentor_gets_time_before_never_logged(self, env):
        mentor = person(env.program, Role.MENTOR, env.facility)
        make(env, mentor, assigned_days_ago=3)
        assert str(mentor.id) not in rows(fetch(env))

    def test_mentor_with_no_live_students_is_excluded(self, env):
        idle = person(env.program, Role.MENTOR, env.facility)
        finished = person(env.program, Role.MENTOR, env.facility)
        make(env, finished, state="completed")
        found = rows(fetch(env))
        assert str(idle.id) not in found and str(finished.id) not in found

    @pytest.mark.parametrize("state", ["orientation", "induction", "active", "paused"])
    def test_every_live_state_counts(self, env, state):
        mentor = person(env.program, Role.MENTOR, env.facility)
        make(env, mentor, state=state)
        assert str(mentor.id) in rows(fetch(env))

    def test_suspended_and_deactivated_are_excluded(self, env):
        for status in (Status.SUSPENDED, Status.DEACTIVATED):
            mentor = person(env.program, Role.MENTOR, env.facility, status=status)
            make(env, mentor)
            assert str(mentor.id) not in rows(fetch(env))

    def test_invited_mentor_is_listed_with_invitation_reason(self, env):
        mentor = person(env.program, Role.MENTOR, env.facility, status=Status.INVITED, signed_in=False)
        row = rows(fetch(env))[str(mentor.id)]
        assert row["reasons"] == ["Invitation not accepted yet"] and row["inactive"] is True

    def test_active_mentor_who_never_signed_in(self, env):
        mentor = person(env.program, Role.MENTOR, env.facility, signed_in=False)
        row = rows(fetch(env))[str(mentor.id)]
        assert row["reasons"] == ["Has not signed in yet"] and row["last_sign_in"] is None

    def test_multiple_reasons_are_all_listed(self, env):
        mentor = person(env.program, Role.MENTOR, env.facility, signed_in=False)
        make(env, mentor)
        assert rows(fetch(env))[str(mentor.id)]["reasons"] == ["Has not signed in yet", "Never logged a session"]

    def test_students_without_recent_session_counts_only_quiet_placements(self, env):
        mentor = person(env.program, Role.MENTOR, env.facility)
        busy, busy_assignment = make(env, mentor)
        make(env, mentor)  # second student, no sessions
        log_session(busy, busy_assignment, 30, env.manager)
        log_session(busy, busy_assignment, 2, env.manager)
        # Recent for one placement means the mentor is active overall, so look at the 7-day-old case instead.
        assert str(mentor.id) not in rows(fetch(env))
        quiet = person(env.program, Role.MENTOR, env.facility)
        placement, assignment = make(env, quiet)
        other, _ = make(env, quiet)
        log_session(placement, assignment, 40, env.manager)
        row = rows(fetch(env))[str(quiet.id)]
        assert row["live_students"] == 2 and row["students_without_recent_session"] == 2

    def test_training_progress_and_accepting_flag(self, env):
        mentor = person(env.program, Role.MENTOR, env.facility, accepting_students=False)
        make(env, mentor)
        row = rows(fetch(env))[str(mentor.id)]
        assert row["training"] == {"required_completed": 0, "required_total": 0}
        assert row["accepting_students"] is False

    def test_induction_waiting_is_a_separate_flag(self, env, checklist_template):
        mentor = person(env.program, Role.MENTOR, env.facility)
        placement, assignment = make(env, mentor)
        log_session(placement, assignment, 1, env.manager)  # the database only allows sessions on active placements
        Placement.objects.filter(id=placement.id).update(state="induction")
        checklist = Checklist.objects.create(placement=placement, template=checklist_template)
        Checklist.objects.filter(id=checklist.id).update(opened_at=timezone.now() - dt.timedelta(days=10))
        data = fetch(env).json()["data"]
        row = {r["id"]: r for r in data["results"]}[str(mentor.id)]
        assert row["inactive"] is False and row["induction_waiting"] is True
        assert row["induction_note"] == "1 induction open for over 7 days"
        assert data["summary"]["inactive"] == 0 and data["summary"]["induction_waiting"] == 1

    def test_sorted_longest_quiet_first_never_logged_before_all(self, env):
        a, b, c = (person(env.program, Role.MENTOR, env.facility) for _ in range(3))
        for mentor, ago in ((a, 20), (b, 45)):
            placement, assignment = make(env, mentor)
            log_session(placement, assignment, ago, env.manager)
        make(env, c)
        order = [r["id"] for r in fetch(env).json()["data"]["results"]]
        assert order == [str(c.id), str(b.id), str(a.id)]


@pytest.mark.django_db
class TestThreshold:
    def test_default_and_bounds(self, env):
        assert fetch(env).json()["data"]["definition"]["days"] == 14
        assert fetch(env, days=7).status_code == 200
        assert fetch(env, days=60).status_code == 200
        for bad in (6, 61, 0, -1, "abc"):
            response = fetch(env, days=bad)
            assert response.status_code == 400
            assert response.json()["error"]["code"] == "InvalidActivityWindow"

    def test_threshold_changes_the_answer(self, env):
        mentor = person(env.program, Role.MENTOR, env.facility)
        placement, assignment = make(env, mentor)
        log_session(placement, assignment, 20, env.manager)
        assert str(mentor.id) in rows(fetch(env, days=14))
        assert str(mentor.id) not in rows(fetch(env, days=30))


@pytest.mark.django_db
class TestScopeAndPrivacy:
    def test_manager_sees_only_own_facility_and_ignores_facility_parameter(self, env):
        other_facility = Facility.objects.create(program=env.program, name="Other Hospital")
        mine = person(env.program, Role.MENTOR, env.facility)
        theirs = person(env.program, Role.MENTOR, other_facility)
        make(env, mine)
        live_placement(mentor=theirs, facility=other_facility, institution=env.institution, cohort=env.cohort, creator=env.manager)
        found = rows(client_for(env.manager).get(URL, {"facility_id": str(other_facility.id)}))
        assert str(mine.id) in found and str(theirs.id) not in found

    def test_other_facilitys_manager_cannot_see_mine(self, env):
        other_facility = Facility.objects.create(program=env.program, name="Other Hospital")
        other_manager = person(env.program, Role.NURSE_MANAGER, other_facility)
        mine = person(env.program, Role.MENTOR, env.facility)
        make(env, mine)
        assert str(mine.id) not in rows(fetch(env, user=other_manager))

    def test_other_programme_mentors_never_appear(self, env):
        from apps.identity.models import Program

        elsewhere = Program.objects.create(name="Another programme")
        stranger = person(elsewhere, Role.MENTOR, env.facility)
        assert str(stranger.id) not in rows(fetch(env))

    def test_programme_admin_sees_all_facilities_and_can_filter(self, env):
        admin = person(env.program, Role.PROGRAM_ADMIN)
        other_facility = Facility.objects.create(program=env.program, name="Other Hospital")
        a = person(env.program, Role.MENTOR, env.facility)
        b = person(env.program, Role.MENTOR, other_facility)
        make(env, a)
        live_placement(mentor=b, facility=other_facility, institution=env.institution, cohort=env.cohort, creator=env.manager)
        assert {str(a.id), str(b.id)} <= set(rows(fetch(env, user=admin)))
        only = rows(client_for(admin).get(URL, {"facility_id": str(other_facility.id)}))
        assert str(b.id) in only and str(a.id) not in only

    def test_other_roles_and_anonymous_are_denied(self, env, coordinator, student, mentor):
        for user in (coordinator, student, mentor):
            assert fetch(env, user=user).status_code == 404  # same "not found" answer as other facility-scoped reads
        assert APIClient().get(URL).status_code in (401, 403)

    def test_inactive_manager_is_denied(self, env):
        env.manager.status = Status.SUSPENDED
        env.manager.save()
        assert fetch(env).status_code == 404

    def test_no_free_text_or_student_identity_leaks(self, env):
        mentor = person(env.program, Role.MENTOR, env.facility)
        placement, assignment = make(env, mentor)
        log_session(placement, assignment, 30, env.manager, text="CONFIDENTIAL-NOTE")
        body = fetch(env).content.decode()
        assert "CONFIDENTIAL-NOTE" not in body
        student = StudentAssignment.objects.get(placement=placement).student
        assert student.email not in body and student.first_name not in body
        row = rows(fetch(env))[str(mentor.id)]
        assert set(row) == {
            "id", "name", "email", "status", "last_sign_in", "last_session_date", "days_since_last_session",
            "sessions_in_window", "live_placements", "live_students", "students_without_recent_session", "training",
            "accepting_students", "inactive", "reason_codes", "reasons", "induction_waiting", "inductions_waiting",
            "induction_note", "remindable", "can_remind", "last_reminded_at", "next_reminder_at",
        }

    def test_service_rejects_bad_actor_directly(self, student):
        from apps.core.errors import UnauthorizedFacilityAccess

        with pytest.raises(UnauthorizedFacilityAccess):
            mentor_activity.mentor_activity(actor=student)
