"""Nurse-manager follow-ups (what the screen needs) and supportive reminders to inactive mentors."""

from __future__ import annotations

import datetime as dt

import pytest
from django.core import mail
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone

from apps.analytics import mentor_reminders
from apps.core.models import AuditEntry, OutboxEvent
from apps.facilities.models import Facility
from apps.identity.models import Role, Status
from apps.mentorship.models import MentorReminder
from apps.notifications.models import Notification, NotificationPreference
from tests.test_followups import HEADERS, SECRET, client_for, listing, log
from tests.test_inactive_mentors import live_placement, log_session, person

PORTAL = "https://app.example.org"
LIST_URL = "/api/v1/mentors/activity"
BULK_URL = "/api/v1/mentors/remind"


def one_url(mentor) -> str:
    return f"/api/v1/mentors/{mentor.id}/remind"


# --------------------------------------------------------------------------- part 1: the follow-ups screen's data

@pytest.mark.django_db(transaction=True)
class TestSupervisorFollowUps:
    def test_rows_carry_mentor_ward_placement_and_no_free_text(self, active_placement, mentor, nurse_manager, student):
        session = log(active_placement, mentor, "supervisor_follow_up", day=10)
        body = listing(nurse_manager)
        row = body["data"][0]
        assert row["session_id"] == str(session.id)
        assert row["mentor"] == {"id": str(mentor.id), "name": mentor.full_name}
        assert row["placement_id"] == str(active_placement.id)
        assert row["student"]["name"] == student.full_name
        assert row["ward"] == "Labour Ward"
        assert row["topics"] and row["age_days"] >= 0
        assert body["meta"]["mentors"] == [{"id": str(mentor.id), "name": mentor.full_name}]
        assert SECRET not in str(body) and "Private feedback wording" not in str(body)

    def test_filter_by_mentor_and_age(self, active_placement, mentor, other_mentor, nurse_manager):
        old = log(active_placement, mentor, "supervisor_follow_up", day=10, age=12)
        log(active_placement, mentor, "supervisor_follow_up", day=11, age=2)
        assert len(listing(nurse_manager)["data"]) == 2
        assert [r["session_id"] for r in listing(nurse_manager, mentor_id=str(mentor.id), min_age_days=7)["data"]] == [str(old.id)]
        assert listing(nurse_manager, mentor_id=str(other_mentor.id))["data"] == []

    def test_mentor_filter_never_widens_scope(self, active_placement, mentor, program):
        from tests.conftest import _user

        log(active_placement, mentor, "supervisor_follow_up")
        elsewhere = Facility.objects.create(program=program, name="Another Hospital")
        outsider = _user(program, Role.NURSE_MANAGER, "elsewhere@other.go.ke", facility=elsewhere)
        body = listing(outsider, mentor_id=str(mentor.id))
        assert body["data"] == [] and body["meta"]["mentors"] == []

    def test_manager_sees_only_supervisor_items_in_the_mentor_list(self, active_placement, mentor, other_mentor, nurse_manager):
        log(active_placement, mentor, "practice_skill", day=10)
        assert listing(nurse_manager)["meta"]["mentors"] == []


# --------------------------------------------------------------------------- part 2: reminders

@pytest.fixture
def env(program, institution, cohort, facility, nurse_manager):
    class Env:
        ...

    e = Env()
    e.program, e.institution, e.cohort, e.facility, e.manager = program, institution, cohort, facility, nurse_manager
    return e


def quiet_mentor(env, *, days_quiet=21, students_named="Wanjiru Secretname"):
    """A mentor with one live student who last logged ``days_quiet`` days ago."""
    mentor = person(env.program, Role.MENTOR, env.facility)
    placement, assignment = live_placement(
        mentor=mentor, facility=env.facility, institution=env.institution, cohort=env.cohort, creator=env.manager,
    )
    student = placement.student_assignments.first().student
    type(student).objects.filter(id=student.id).update(first_name=students_named, last_name="Studentsurname")
    if days_quiet is not None:
        log_session(placement, assignment, days_quiet, env.manager)
    return mentor, placement


def remind_one(user, mentor, **body):
    return client_for(user).post(one_url(mentor), body, format="json", **HEADERS)


def remind_many(user, **body):
    return client_for(user).post(BULK_URL, body, format="json", **HEADERS)


def dispatch():
    call_command("dispatch_outbox")


@pytest.mark.django_db
class TestEligibilityAndScope:
    def test_listed_mentor_can_be_reminded_and_history_is_recorded(self, env):
        mentor, _ = quiet_mentor(env)
        listed = client_for(env.manager).get(LIST_URL).json()["data"]["results"][0]
        assert listed["remindable"] and listed["can_remind"] and listed["last_reminded_at"] is None
        response = remind_one(env.manager, mentor)
        assert response.status_code == 201, response.content
        data = response.json()["data"]
        assert data["status"] == "sent" and data["next_reminder_at"] > data["last_reminded_at"]
        reminder = MentorReminder.objects.get(mentor=mentor)
        assert reminder.sent_by_id == env.manager.id and reminder.reason_codes == ["no_recent_session"]
        after = client_for(env.manager).get(LIST_URL).json()["data"]["results"][0]
        assert after["last_reminded_at"] and after["can_remind"] is False and after["remindable"] is True

    def test_mentor_who_is_not_listed_cannot_be_reminded(self, env):
        mentor, placement = quiet_mentor(env, days_quiet=3)  # logged 3 days ago: not inactive
        response = remind_one(env.manager, mentor)
        assert response.status_code == 409 and response.json()["error"]["code"] == "MentorNotRemindable"
        assert not OutboxEvent.objects.filter(event_type="MentorReminderRequested").exists()
        assert not MentorReminder.objects.exists()

    def test_the_client_cannot_override_eligibility_with_a_wider_window(self, env):
        mentor, _ = quiet_mentor(env, days_quiet=10)
        assert remind_one(env.manager, mentor, days=14).status_code == 409
        assert remind_one(env.manager, mentor, days=7).status_code == 201

    def test_other_facilities_mentors_are_out_of_reach(self, env):
        from apps.facilities.models import Facility

        mentor, _ = quiet_mentor(env)
        other_site = Facility.objects.create(program=env.program, name="Elsewhere Hospital")
        other_manager = person(env.program, Role.NURSE_MANAGER, other_site)
        assert remind_one(other_manager, mentor).status_code == 409
        assert remind_many(other_manager, mentor_ids=[str(mentor.id)]).json()["data"]["results"][0]["status"] == "not_listed"
        assert not OutboxEvent.objects.filter(event_type="MentorReminderRequested").exists()

    def test_invited_account_is_not_remindable(self, env):
        invited = person(env.program, Role.MENTOR, env.facility, status=Status.INVITED, signed_in=False)
        row = {r["id"]: r for r in client_for(env.manager).get(LIST_URL).json()["data"]["results"]}[str(invited.id)]
        assert row["remindable"] is False and row["can_remind"] is False
        assert remind_one(env.manager, invited).status_code == 409

    @pytest.mark.parametrize("role", [Role.MENTOR, Role.COORDINATOR, Role.STUDENT])
    def test_other_roles_are_refused(self, env, role):
        mentor, _ = quiet_mentor(env)
        outsider = person(env.program, role, env.facility if role == Role.MENTOR else None, institution=env.institution if role != Role.MENTOR else None)
        assert remind_one(outsider, mentor).status_code == 404
        assert remind_many(outsider, all_listed=True).status_code == 404
        assert not OutboxEvent.objects.filter(event_type="MentorReminderRequested").exists()

    def test_anonymous_is_refused(self, env):
        mentor, _ = quiet_mentor(env)
        from rest_framework.test import APIClient

        assert APIClient().post(one_url(mentor), {}, format="json", **HEADERS).status_code in {401, 403}

    def test_programme_admin_can_remind_across_facilities(self, env):
        mentor, _ = quiet_mentor(env)
        admin = person(env.program, Role.PROGRAM_ADMIN)
        assert remind_one(admin, mentor).status_code == 201


@pytest.mark.django_db
class TestRateLimitAndBulk:
    def test_one_reminder_per_mentor_per_three_days(self, env):
        mentor, _ = quiet_mentor(env)
        assert remind_one(env.manager, mentor).status_code == 201
        again = remind_one(env.manager, mentor)
        assert again.status_code == 429
        error = again.json()["error"]
        assert error["code"] == "ReminderTooSoon" and error["details"]["next_reminder_at"]
        assert MentorReminder.objects.filter(mentor=mentor).count() == 1
        assert OutboxEvent.objects.filter(event_type="MentorReminderRequested").count() == 1
        # a colleague cannot get around it either
        second_manager = person(env.program, Role.NURSE_MANAGER, env.facility)
        assert remind_one(second_manager, mentor).status_code == 429

    def test_allowed_again_after_three_days(self, env):
        mentor, _ = quiet_mentor(env)
        remind_one(env.manager, mentor)
        MentorReminder.objects.filter(mentor=mentor).update(sent_at=timezone.now() - dt.timedelta(days=3, minutes=1))
        assert client_for(env.manager).get(LIST_URL).json()["data"]["results"][0]["can_remind"] is True
        assert remind_one(env.manager, mentor).status_code == 201
        assert MentorReminder.objects.filter(mentor=mentor).count() == 2

    def test_next_reminder_time_is_three_days_after_the_last(self, env):
        mentor, _ = quiet_mentor(env)
        data = remind_one(env.manager, mentor).json()["data"]
        sent = dt.datetime.fromisoformat(data["last_reminded_at"])
        assert dt.datetime.fromisoformat(data["next_reminder_at"]) - sent == dt.timedelta(days=3)

    def test_bulk_sends_to_listed_mentors_and_is_idempotent(self, env):
        first, _ = quiet_mentor(env)
        second, _ = quiet_mentor(env, days_quiet=30)
        fine, _ = quiet_mentor(env, days_quiet=2)
        ids = [str(first.id), str(second.id), str(fine.id)]
        data = remind_many(env.manager, mentor_ids=ids).json()["data"]
        by_id = {r["mentor_id"]: r["status"] for r in data["results"]}
        assert by_id == {str(first.id): "sent", str(second.id): "sent", str(fine.id): "not_listed"}
        assert data["summary"]["sent"] == 2 and data["summary"]["not_listed"] == 1
        # pressing it again (double tap, retry, second tab) sends nothing new
        again = remind_many(env.manager, mentor_ids=ids).json()["data"]
        assert again["summary"]["sent"] == 0 and again["summary"]["already_reminded"] == 2
        assert OutboxEvent.objects.filter(event_type="MentorReminderRequested").count() == 2

    def test_remind_all_listed_skips_those_reminded_recently(self, env):
        done, _ = quiet_mentor(env)
        waiting, _ = quiet_mentor(env, days_quiet=40)
        remind_one(env.manager, done)
        data = remind_many(env.manager, all_listed=True).json()["data"]
        assert [r["mentor_id"] for r in data["results"]] == [str(waiting.id)]
        assert data["summary"]["sent"] == 1

    def test_bulk_is_capped(self, env, monkeypatch):
        mentors = [quiet_mentor(env)[0] for _ in range(3)]
        monkeypatch.setattr(mentor_reminders, "BULK_CAP", 2)
        data = remind_many(env.manager, all_listed=True).json()["data"]
        assert data["summary"]["sent"] == 2 and data["summary"]["remaining"] == 1 and data["summary"]["cap"] == 2
        refused = remind_many(env.manager, mentor_ids=[str(m.id) for m in mentors])
        assert refused.status_code == 422 and refused.json()["error"]["code"] == "TooManyReminders"
        # the second press picks up the one that was left
        assert remind_many(env.manager, all_listed=True).json()["data"]["summary"]["sent"] == 1

    def test_bulk_requires_a_choice(self, env):
        assert remind_many(env.manager).status_code == 400
        assert remind_many(env.manager, mentor_ids=[]).status_code == 400
        assert remind_many(env.manager, all_listed=True, mentor_ids=["00000000-0000-0000-0000-000000000000"]).status_code == 400
        assert remind_many(env.manager, mentor_ids=["not-a-uuid"]).status_code == 400


@pytest.mark.django_db
class TestAuditAndMessage:
    def test_every_send_is_audited(self, env):
        a, _ = quiet_mentor(env)
        b, _ = quiet_mentor(env)
        remind_many(env.manager, mentor_ids=[str(a.id), str(b.id)])
        entries = AuditEntry.objects.filter(action="mentor.reminder_send")
        assert entries.count() == 2
        entry = entries.get(changes__mentor_id=str(a.id))
        assert entry.actor_id == env.manager.id and entry.actor_role == Role.NURSE_MANAGER
        assert entry.changes["reason_codes"] == ["no_recent_session"]
        remind_one(env.manager, a)  # refused (too soon) -> nothing more is audited
        assert AuditEntry.objects.filter(action="mentor.reminder_send").count() == 2

    @override_settings(LINKS_MUST_BE_PUBLIC=True, FRONTEND_BASE_URL=PORTAL)
    def test_in_app_notification_and_plain_text_email_without_student_names(self, env):
        mentor, _ = quiet_mentor(env)
        remind_one(env.manager, mentor)
        event = OutboxEvent.objects.get(event_type="MentorReminderRequested")
        assert "Secretname" not in str(event.payload) and "Studentsurname" not in str(event.payload)
        assert event.payload["recipient_user_ids"] == [str(mentor.id)]
        dispatch()

        note = Notification.objects.get(user_id=mentor.id, template_key="mentorship.reminder")
        assert note.payload["sent_by_name"] == env.manager.full_name
        assert note.payload["message"] == (
            "You have 1 student and no session logged in 21 days. Logging takes about a minute, even from your phone, and works offline."
        )
        assert "recipient_user_ids" not in note.payload and "Secretname" not in str(note.payload)
        assert note.status == Notification.STATUS_SENT

        (message,) = [m for m in mail.outbox if m.to == [mentor.email]]
        assert message.subject == f"A friendly reminder from {env.manager.full_name}"
        assert note.payload["message"] in message.body
        assert env.manager.full_name in message.body and f"Hello {mentor.first_name}" in message.body
        assert f"{PORTAL}/mentor?view=log" in message.body  # public link, from portal_url
        assert "localhost" not in message.body and "127.0.0.1" not in message.body
        assert "Secretname" not in message.body and "Studentsurname" not in message.body
        assert not message.alternatives  # plain text only

    @override_settings(LINKS_MUST_BE_PUBLIC=True, FRONTEND_BASE_URL=PORTAL)
    def test_never_signed_in_mentor_gets_a_sign_in_nudge(self, env):
        mentor = person(env.program, Role.MENTOR, env.facility, signed_in=False)
        live_placement(mentor=mentor, facility=env.facility, institution=env.institution, cohort=env.cohort, creator=env.manager)
        assert remind_one(env.manager, mentor).status_code == 201
        dispatch()
        (message,) = [m for m in mail.outbox if m.to == [mentor.email]]
        assert "would love to see you on MentorMAMA" in message.body and "offline" in message.body
        assert f"Sign in to MentorMAMA: {PORTAL}" in message.body and "view=log" not in message.body
        assert "Studentsurname" not in message.body

    def test_message_wording_for_each_reason(self):
        from apps.mentorship.reminders import compose

        assert compose(reason_codes=["never_logged"], live_students=3, days_since_last_session=None).startswith(
            "You have 3 students and no session logged yet.")
        assert compose(reason_codes=["no_recent_session"], live_students=1, days_since_last_session=1).startswith(
            "You have 1 student and no session logged in 1 day.")
        assert "sign" in compose(reason_codes=["not_signed_in"], live_students=0, days_since_last_session=None).lower()


@pytest.mark.django_db
class TestPreference:
    def test_reminder_is_optional_not_mandatory(self):
        from apps.notifications.email import MANDATORY_EVENTS

        assert "MentorReminderRequested" not in MANDATORY_EVENTS

    def test_session_follow_up_switch_off_keeps_the_in_app_notice_but_sends_no_email(self, env):
        mentor, _ = quiet_mentor(env)
        NotificationPreference.objects.create(user_id=mentor.id, account_activity=False)
        remind_one(env.manager, mentor)
        dispatch()
        note = Notification.objects.get(user_id=mentor.id, template_key="mentorship.reminder")
        assert note.status == Notification.STATUS_NOT_EMAILED
        assert [m for m in mail.outbox if m.to == [mentor.email]] == []

    def test_other_switches_do_not_block_it(self, env):
        mentor, _ = quiet_mentor(env)
        NotificationPreference.objects.create(user_id=mentor.id, programme_updates=False, placement_updates=False)
        remind_one(env.manager, mentor)
        dispatch()
        assert len([m for m in mail.outbox if m.to == [mentor.email]]) == 1
