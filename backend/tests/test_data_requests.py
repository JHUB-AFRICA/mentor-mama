"""Formal data requests (concept note section 13): correct, show or delete what is held about a person."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.core import mail
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import AuditEntry, OutboxEvent
from apps.identity.models import DataRequest, Program, Role, Status, User
from apps.notifications.models import Notification
from apps.platform.models import Enquiry

pytestmark = pytest.mark.django_db(transaction=True)

URL = "/api/v1/privacy/requests"
ADMIN_URL = "/api/v1/privacy/requests/admin"
PORTAL = "https://app.example.org"


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def body(**changes):
    return {"request_type": "correction", "subject_area": "profile",
            "description": "My surname is spelled wrongly on my profile.",
            "requested_change": "It should read Wanjiku.", **changes}


@pytest.fixture
def admin(program):
    return User.objects.create_user("admin@jkuat.ac.ke", "pw", first_name="Ada", last_name="Admin",
                                    role=Role.PROGRAM_ADMIN, status=Status.ACTIVE, program=program)


@pytest.fixture
def second_admin(program):
    return User.objects.create_user("admin2@jkuat.ac.ke", "pw", first_name="Bo", last_name="Admin",
                                    role=Role.PROGRAM_ADMIN, status=Status.ACTIVE, program=program)


@pytest.fixture
def platform_admin(db):
    return User.objects.create_superuser("ops@example.test", "Mentor-Platform-2026!", first_name="Ops", last_name="Admin")


@pytest.fixture
def other_programme_admin(db):
    other = Program.objects.create(name="Other Pilot")
    return User.objects.create_user("admin@other.test", "pw", first_name="Oti", last_name="Admin",
                                    role=Role.PROGRAM_ADMIN, status=Status.ACTIVE, program=other)


def submit(user, **changes):
    return client_for(user).post(URL, body(**changes), format="json")


def dispatch():
    call_command("dispatch_outbox")


# --------------------------------------------------------------------------- submitting and reading your own

@pytest.mark.parametrize("role_fixture", ["student", "mentor", "nurse_manager", "coordinator"])
def test_every_role_can_submit_and_sees_it_in_their_history(request, admin, role_fixture):
    person = request.getfixturevalue(role_fixture)
    created = submit(person)
    assert created.status_code == 201, created.content
    data = created.json()["data"]
    assert data["status"] == "received" and data["routed_to"] == "programme"
    assert data["is_open"] and data["days_left"] in (29, 30)
    listed = client_for(person).get(URL).json()
    assert [row["id"] for row in listed["data"]] == [data["id"]]
    assert listed["meta"]["response_days"] == 30


def test_you_only_ever_see_your_own_requests(admin, student, mentor):
    submit(student)
    submit(mentor, subject_area="placement", description="The wrong ward is shown for me.")
    mine = client_for(student).get(URL).json()["data"]
    assert len(mine) == 1 and mine[0]["subject_area"] == "profile"
    theirs = client_for(mentor).get(URL).json()["data"]
    assert len(theirs) == 1 and theirs[0]["subject_area"] == "placement"


def test_input_is_validated(admin, student):
    client = client_for(student)
    assert client.post(URL, body(description="short"), format="json").status_code == 400
    assert client.post(URL, body(description="x" * 2001), format="json").status_code == 400
    assert client.post(URL, body(request_type="sell"), format="json").status_code == 400
    assert client.post(URL, body(subject_area="everything"), format="json").status_code == 400
    # a correction must say what it should say; an access request need not
    assert client.post(URL, body(requested_change=""), format="json").status_code == 400
    ok = client.post(URL, {"request_type": "access", "subject_area": "other", "description": "Please show me what you hold."}, format="json")
    assert ok.status_code == 201


def test_signed_out_and_platform_admins_cannot_use_it(platform_admin):
    assert APIClient().post(URL, body(), format="json").status_code in (401, 403)
    assert client_for(platform_admin).post(URL, body(), format="json").status_code == 404
    assert DataRequest.objects.count() == 0


def test_one_open_request_per_type_at_a_time(admin, student):
    assert submit(student).status_code == 201
    again = submit(student)
    assert again.status_code == 409 and again.json()["error"]["code"] == "DataRequestAlreadyOpen"
    # a different kind is fine, and so is the same kind once the first is withdrawn
    assert submit(student, request_type="access").status_code == 201
    first = DataRequest.objects.get(requester=student, request_type="correction")
    assert client_for(student).post(f"{URL}/{first.id}/withdraw").status_code == 200
    assert submit(student).status_code == 201
    assert DataRequest.objects.filter(requester=student).count() == 3


def test_submissions_are_rate_limited(admin, student, monkeypatch):
    from rest_framework.throttling import ScopedRateThrottle

    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "privacy_request", "2/hour")
    assert submit(student, request_type="correction").status_code == 201
    assert submit(student, request_type="access").status_code == 201
    limited = submit(student, request_type="erasure")
    assert limited.status_code == 429
    # reading your history is never limited
    assert client_for(student).get(URL).status_code == 200


# --------------------------------------------------------------------------- withdrawing

def test_withdraw_closes_an_open_request_only_for_its_owner(admin, student, mentor):
    row_id = submit(student).json()["data"]["id"]
    assert client_for(mentor).post(f"{URL}/{row_id}/withdraw").status_code == 404
    assert client_for(admin).post(f"{URL}/{row_id}/withdraw").status_code == 404
    done = client_for(student).post(f"{URL}/{row_id}/withdraw")
    assert done.status_code == 200 and done.json()["data"]["status"] == "withdrawn" and done.json()["data"]["closed_at"]
    assert client_for(student).post(f"{URL}/{row_id}/withdraw").status_code == 409
    assert AuditEntry.objects.filter(action="privacy.data_request_withdrawn", entity_id=row_id, actor=student).count() == 1


# --------------------------------------------------------------------------- the programme queue

def test_queue_is_for_programme_admins_of_that_programme_only(admin, second_admin, other_programme_admin, student, mentor, coordinator):
    mine = submit(student).json()["data"]["id"]
    submit(mentor)
    other_student = User.objects.create_user("s@other.test", "pw", first_name="S", last_name="Other", role=Role.MENTOR,
                                             status=Status.ACTIVE, program=other_programme_admin.program,
                                             facility_id=other_programme_admin.program_id)  # scope id unused here
    submit(other_student)
    queue = client_for(admin).get(ADMIN_URL).json()["data"]
    assert queue["counts"]["open"] == 2
    assert {row["requester"]["email"] for row in queue["results"]} == {student.email, mentor.email}
    # the other programme's administrator sees only theirs, and cannot open ours
    theirs = client_for(other_programme_admin).get(ADMIN_URL).json()["data"]
    assert [row["requester"]["email"] for row in theirs["results"]] == ["s@other.test"]
    assert client_for(other_programme_admin).get(f"{ADMIN_URL}/{mine}").status_code == 404
    assert client_for(other_programme_admin).post(f"{ADMIN_URL}/{mine}/review").status_code == 404
    # people who are not administrators get nothing
    for person in (student, mentor, coordinator):
        assert client_for(person).get(ADMIN_URL).status_code == 404
        assert client_for(person).get(f"{ADMIN_URL}/{mine}").status_code == 404
        assert client_for(person).post(f"{ADMIN_URL}/{mine}/complete", {"note": "Done."}, format="json").status_code == 404


def test_queue_search_filters_and_open_first_ordering(admin, student, mentor, coordinator):
    a = submit(student).json()["data"]["id"]
    b = submit(mentor, request_type="access", subject_area="other", description="Show me everything you hold.").json()["data"]["id"]
    c = submit(coordinator, request_type="erasure", subject_area="other", description="Please deactivate my account.").json()["data"]["id"]
    client = client_for(admin)
    client.post(f"{ADMIN_URL}/{c}/decline", {"note": "Not possible yet."}, format="json")
    results = client.get(ADMIN_URL).json()["data"]["results"]
    assert {row["id"] for row in results} == {a, b}  # default filter is open
    everything = client.get(ADMIN_URL, {"status": "all"}).json()["data"]["results"]
    assert [row["id"] for row in everything][-1] == c  # closed after open
    assert [r["id"] for r in client.get(ADMIN_URL, {"status": "declined"}).json()["data"]["results"]] == [c]
    assert [r["id"] for r in client.get(ADMIN_URL, {"request_type": "access"}).json()["data"]["results"]] == [b]
    assert [r["id"] for r in client.get(ADMIN_URL, {"search": "coordinator@"}).json()["data"]["results"]] == []
    assert [r["id"] for r in client.get(ADMIN_URL, {"search": "mentor@knh", "status": "all"}).json()["data"]["results"]] == [b]
    assert client.get(ADMIN_URL, {"status": "bogus"}).status_code == 400


def test_sla_shows_age_and_overdue(admin, student, mentor):
    late = submit(student).json()["data"]["id"]
    submit(mentor)
    DataRequest.objects.filter(id=late).update(created_at=timezone.now() - timedelta(days=33),
                                               due_at=timezone.now() - timedelta(days=3))
    client = client_for(admin)
    data = client.get(ADMIN_URL).json()["data"]
    assert data["counts"]["overdue"] == 1
    assert data["results"][0]["id"] == late  # most overdue first
    assert data["results"][0]["overdue"] and data["results"][0]["age_days"] >= 33 and data["results"][0]["days_overdue"] >= 3
    assert [r["id"] for r in client.get(ADMIN_URL, {"overdue": "true"}).json()["data"]["results"]] == [late]
    detail = client.get(f"{ADMIN_URL}/{late}").json()["data"]
    assert detail["requester"]["role"] == "student" and detail["description"]


# --------------------------------------------------------------------------- lifecycle

def test_lifecycle_review_then_complete_with_audit_and_notifications(admin, student):
    row_id = submit(student).json()["data"]["id"]
    client = client_for(admin)
    reviewed = client.post(f"{ADMIN_URL}/{row_id}/review").json()["data"]
    assert reviewed["status"] == "in_review" and reviewed["reviewed_by"] == "Ada Admin"
    # reviewing twice is not a thing
    assert client.post(f"{ADMIN_URL}/{row_id}/review").status_code == 409
    done = client.post(f"{ADMIN_URL}/{row_id}/complete", {"note": "Your surname was corrected on your profile."}, format="json")
    assert done.status_code == 200
    data = done.json()["data"]
    assert data["status"] == "completed" and data["response_note"].startswith("Your surname") and data["closed_at"]
    # the person sees the status and the note
    mine = client_for(student).get(URL).json()["data"][0]
    assert mine["status"] == "completed" and mine["response_note"] == data["response_note"] and mine["reviewed_by"] == "Ada Admin"
    # nothing more can happen to a closed request
    for verb in ("review", "complete", "decline"):
        assert client.post(f"{ADMIN_URL}/{row_id}/{verb}", {"note": "again"}, format="json").status_code == 409
    assert client_for(student).post(f"{URL}/{row_id}/withdraw").status_code == 409
    actions = list(AuditEntry.objects.filter(entity_id=row_id).order_by("occurred_at").values_list("action", flat=True))
    assert actions == ["privacy.data_request_created", "privacy.data_request_in_review",
                       "privacy.data_request_completed"]


def test_complete_can_follow_received_directly_and_decline_needs_a_reason(admin, student, mentor):
    first = submit(student).json()["data"]["id"]
    client = client_for(admin)
    assert client.post(f"{ADMIN_URL}/{first}/decline").status_code == 422
    assert client.post(f"{ADMIN_URL}/{first}/decline", {"note": "   "}, format="json").status_code == 422
    assert client.post(f"{ADMIN_URL}/{first}/complete", {}, format="json").status_code == 422
    assert DataRequest.objects.get(id=first).status == "received"
    declined = client.post(f"{ADMIN_URL}/{first}/decline", {"note": "We need proof of your name change first."}, format="json")
    assert declined.status_code == 200 and declined.json()["data"]["status"] == "declined"
    second = submit(mentor).json()["data"]["id"]
    assert client.post(f"{ADMIN_URL}/{second}/complete", {"note": "Fixed."}, format="json").json()["data"]["status"] == "completed"
    # a declined request frees the person to ask again
    assert submit(student).status_code == 201


def test_an_admin_cannot_act_on_a_withdrawn_request(admin, student):
    row_id = submit(student).json()["data"]["id"]
    client_for(student).post(f"{URL}/{row_id}/withdraw")
    assert client_for(admin).post(f"{ADMIN_URL}/{row_id}/review").status_code == 409


# --------------------------------------------------------------------------- the platform inbox

def test_a_programme_admins_own_request_lands_in_the_platform_inbox(admin, second_admin, platform_admin):
    created = submit(admin, request_type="erasure", subject_area="other", description="Please close my account after the pilot.")
    data = created.json()["data"]
    assert data["routed_to"] == "platform" and data["enquiry_reference"].startswith("SUP-")
    enquiry = Enquiry.objects.get(reference=data["enquiry_reference"])
    assert (enquiry.kind, enquiry.topic, enquiry.email) == ("support", "account", admin.email)
    assert enquiry.details["data_request"] is True and enquiry.details["request_type"] == "erasure"
    assert "Please close my account" in enquiry.message
    # it is not in anyone's programme queue, not even their fellow administrator's
    assert client_for(second_admin).get(ADMIN_URL).json()["data"]["results"] == []
    assert client_for(admin).get(ADMIN_URL).json()["data"]["results"] == []
    assert client_for(second_admin).get(f"{ADMIN_URL}/{data['id']}").status_code == 404
    assert not OutboxEvent.objects.filter(event_type="DataRequestSubmitted").exists()
    # progress in the platform inbox is mirrored onto the person's own history
    from apps.platform import enquiries
    enquiries.set_status(actor=platform_admin, enquiry=enquiry, status="in_progress")
    assert client_for(admin).get(URL).json()["data"][0]["status"] == "in_review"
    enquiries.set_status(actor=platform_admin, enquiry=enquiry, status="resolved")
    mine = client_for(admin).get(URL).json()["data"][0]
    assert mine["status"] == "completed" and not mine["is_open"]
    # the same kind can then be requested again
    assert submit(admin, request_type="erasure", subject_area="other", description="Another request about it.").status_code == 201


def test_platform_routed_requests_cannot_be_withdrawn_in_the_app(admin, platform_admin):
    row_id = submit(admin).json()["data"]["id"]
    refused = client_for(admin).post(f"{URL}/{row_id}/withdraw")
    assert refused.status_code == 409 and "email" in refused.json()["error"]["message"].lower()


def test_without_an_active_administrator_the_request_goes_to_the_platform_team(program, student, platform_admin):
    data = submit(student).json()["data"]
    assert data["routed_to"] == "platform" and Enquiry.objects.filter(reference=data["enquiry_reference"]).exists()


# --------------------------------------------------------------------------- notifications and email

@override_settings(LINKS_MUST_BE_PUBLIC=True, FRONTEND_BASE_URL=PORTAL, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_notifications_and_emails_for_new_requests_and_status_changes(admin, second_admin, student):
    row_id = submit(student).json()["data"]["id"]
    submitted = OutboxEvent.objects.get(event_type="DataRequestSubmitted")
    assert set(submitted.payload["recipient_user_ids"]) == {str(admin.id), str(second_admin.id)}
    assert not {"description", "requested_change", "name", "email"} & set(submitted.payload)  # identifiers only
    dispatch()
    alerts = Notification.objects.filter(template_key="privacy.request_submitted")
    assert {n.user_id for n in alerts} == {admin.id, second_admin.id}
    assert len([m for m in mail.outbox if "data request" in m.subject.lower()]) == 2

    mail.outbox.clear()
    client_for(admin).post(f"{ADMIN_URL}/{row_id}/review")
    client_for(admin).post(f"{ADMIN_URL}/{row_id}/complete", {"note": "Corrected your surname, Wanjiku."}, format="json")
    dispatch()
    rows = Notification.objects.filter(user_id=student.id, template_key="privacy.request_status_changed")
    assert sorted(r.payload["request_status"] for r in rows) == ["completed", "in_review"]
    sent = [m for m in mail.outbox if m.to == [student.email]]
    assert len(sent) == 2
    for message in sent:
        assert "localhost" not in message.body and "127.0.0.1" not in message.body
        assert "Wanjiku" not in message.body and "surname" not in message.body  # the note stays in the app
        assert f"{PORTAL}/account?tab=privacy" in message.body
    assert not Notification.objects.filter(user_id=admin.id, template_key="privacy.request_status_changed").exists()


@override_settings(LINKS_MUST_BE_PUBLIC=True, FRONTEND_BASE_URL=PORTAL, EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_status_email_is_mandatory_even_when_optional_updates_are_off(admin, student):
    from apps.notifications.models import NotificationPreference

    NotificationPreference.objects.create(user_id=student.id, programme_updates=False, placement_updates=False, account_activity=False)
    row_id = submit(student).json()["data"]["id"]
    client_for(admin).post(f"{ADMIN_URL}/{row_id}/decline", {"note": "Not now."}, format="json")
    dispatch()
    assert any(m.to == [student.email] for m in mail.outbox)


def test_audit_trail_never_holds_the_free_text(admin, student):
    row_id = submit(student, description="My home village is Kiambu and my surname is wrong.").json()["data"]["id"]
    client_for(admin).post(f"{ADMIN_URL}/{row_id}/complete", {"note": "Changed it for you."}, format="json")
    for entry in AuditEntry.objects.filter(entity_id=row_id):
        text = str(entry.changes) + str(entry.override_reason)
        assert "Kiambu" not in text and "Changed it" not in text
        assert entry.scope == {"program_id": str(student.program_id)}
    assert AuditEntry.objects.filter(entity_id=row_id, actor=admin, action="privacy.data_request_completed").exists()
