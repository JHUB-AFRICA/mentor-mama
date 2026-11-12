import time
from datetime import timedelta

import pytest
from django.core import mail
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import AuditEntry
from apps.identity.models import Program, Role, Status, User
from apps.platform import enquiries
from apps.platform.models import Enquiry, EnquiryEvent

STRONG = "Mentor-Platform-2026!"
PUBLIC = "/api/v1/public/enquiries"


@pytest.fixture(autouse=True)
def _fresh_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def platform_admin(db):
    return User.objects.create_superuser("ops@example.test", STRONG, first_name="Ops", last_name="Admin")


@pytest.fixture
def ops(platform_admin):
    client = APIClient()
    client.force_authenticate(platform_admin)
    return client


def contact_payload(**overrides):
    payload = {
        "kind": "contact", "topic": "general", "name": "Wanjiru Kamau", "email": "Wanjiru@Example.org",
        "message": "We would like to hear how MentorMAMA works in a county hospital.", "consent": True,
        "started_at": int((time.time() - 30) * 1000),
    }
    return {**payload, **overrides}


def pilot_payload(**overrides):
    values = {
        "kind": "pilot", "topic": "pilot", "organisation": "Nakuru Level 5 Hospital",
        "message": "We run a maternity unit with 12 mentors and want to pilot.",
        "details": {"role_title": "Nurse in charge", "organisation_type": "health_facility", "county": "Nakuru",
                    "mentors": 12, "students": 30, "start_term": "January 2027"}, **overrides}
    return contact_payload(**values)


def sent_to(address):
    return [m for m in mail.outbox if address in m.to]


# ------------------------------------------------------------------ public submission

def test_a_visitor_can_send_a_message_and_gets_a_reference_and_an_acknowledgement(db, platform_admin):
    response = APIClient().post(PUBLIC, contact_payload(), format="json")
    assert response.status_code == 201
    reference = response.json()["data"]["reference"]
    assert reference.startswith("CON-") and reference.endswith("-0001")
    enquiry = Enquiry.objects.get(reference=reference)
    assert enquiry.email == "wanjiru@example.org" and enquiry.status == Enquiry.Status.NEW and enquiry.seen_at is None

    sent, failed = enquiries.send_pending_emails()
    assert (sent, failed) == (2, 0)  # acknowledgement + alert to the team
    ack = sent_to("wanjiru@example.org")[0]
    assert reference in ack.subject and "received" in ack.subject.lower()
    assert reference in ack.body and "2 working days" in ack.body and "county hospital" in ack.body
    alert = sent_to("ops@example.test")[0]
    assert reference in alert.subject and f"/platform/messages/{enquiry.id}" in alert.body


def test_each_kind_gets_its_own_reference_and_pilot_answers_are_kept(db):
    client = APIClient()
    assert client.post(PUBLIC, pilot_payload(email="p@example.org"), format="json").json()["data"]["reference"].startswith("PIL-")
    support = client.post(PUBLIC, contact_payload(kind="support", topic="sign_in", email="s@example.org"), format="json")
    assert support.json()["data"]["reference"].startswith("SUP-")
    pilot = Enquiry.objects.get(kind="pilot")
    assert pilot.details["mentors"] == 12 and pilot.details["county"] == "Nakuru" and pilot.organisation.startswith("Nakuru")
    assert Enquiry.objects.get(kind="support").priority == "high"  # people locked out come first
    second = client.post(PUBLIC, pilot_payload(email="q@example.org", message="A second unit, different message here."), format="json")
    assert second.json()["data"]["reference"].endswith("-0002")


def test_invalid_submissions_are_rejected_with_a_reason(db):
    client = APIClient()
    assert client.post(PUBLIC, contact_payload(consent=False), format="json").status_code == 400
    assert client.post(PUBLIC, contact_payload(topic="nonsense"), format="json").status_code == 400
    assert client.post(PUBLIC, contact_payload(message="short"), format="json").status_code == 400
    assert client.post(PUBLIC, contact_payload(email="not-an-email"), format="json").status_code == 400
    assert Enquiry.objects.count() == 0


def test_bots_look_successful_but_nothing_is_stored_or_sent(db):
    client = APIClient()
    assert client.post(PUBLIC, contact_payload(website="http://spam.example"), format="json").status_code == 202
    assert client.post(PUBLIC, contact_payload(started_at=int(time.time() * 1000)), format="json").status_code == 202
    assert Enquiry.objects.count() == 0 and EnquiryEvent.objects.count() == 0


def test_double_submits_return_the_first_enquiry(db):
    client = APIClient()
    first = client.post(PUBLIC, contact_payload(), format="json")
    again = client.post(PUBLIC, contact_payload(), format="json")
    assert first.status_code == 201 and again.status_code == 200
    assert first.json()["data"]["reference"] == again.json()["data"]["reference"]
    assert Enquiry.objects.count() == 1


def test_one_address_cannot_flood_the_inbox(db):
    client = APIClient()
    for index in range(5):
        assert client.post(PUBLIC, contact_payload(message=f"Message number {index} about the pilot."), format="json").status_code == 201
    blocked = client.post(PUBLIC, contact_payload(message="One message too many for this hour."), format="json")
    assert blocked.status_code == 429 and blocked.json()["error"]["code"] == "TooManyRequests"


def test_the_public_endpoint_needs_no_session_and_ignores_csrf(db):
    client = APIClient(enforce_csrf_checks=True)
    assert client.post(PUBLIC, contact_payload(), format="json").status_code == 201


# ------------------------------------------------------------------ email reliability

def test_a_failed_email_is_kept_retried_and_finally_marked_failed(db, monkeypatch, platform_admin):
    enquiry, _ = enquiries.submit(kind="contact", topic="general", name="Amina", email="amina@example.org", message="Hello there, one question.")
    monkeypatch.setattr("apps.platform.enquiry_email.send", lambda event: (_ for _ in ()).throw(RuntimeError("provider down")))
    for _ in range(enquiries.MAX_EMAIL_ATTEMPTS):
        EnquiryEvent.objects.filter(email_status="queued").update(email_next_attempt_at=None)
        enquiries.send_pending_emails()
    ack = enquiry.events.get(email_template="acknowledgement")
    assert ack.email_status == "failed" and "provider down" in ack.email_error and ack.email_attempts == enquiries.MAX_EMAIL_ATTEMPTS
    assert Enquiry.objects.filter(id=enquiry.id).exists()  # the message itself was never lost

    monkeypatch.undo()
    resent = enquiries.resend_email(actor=platform_admin, enquiry=enquiry, event_id=ack.id)
    assert resent.email_status == "queued"
    enquiries.send_pending_emails()
    ack.refresh_from_db()
    assert ack.email_status == "sent" and sent_to("amina@example.org")


def test_a_retry_does_not_email_a_team_member_twice(db, monkeypatch, platform_admin):
    second = User.objects.create_superuser("two@example.test", STRONG, first_name="Two", last_name="Admin")
    enquiries.submit(kind="contact", topic="general", name="Amina", email="amina@example.org", message="Hello there, one question.")
    real_send = mail.EmailMultiAlternatives.send
    calls = {"n": 0}

    def flaky(self, *args, **kwargs):
        if "two@example.test" in self.to and calls["n"] == 0:
            calls["n"] += 1
            raise RuntimeError("blip")
        return real_send(self, *args, **kwargs)

    monkeypatch.setattr(mail.EmailMultiAlternatives, "send", flaky)
    enquiries.send_pending_emails()
    EnquiryEvent.objects.filter(email_status="queued").update(email_next_attempt_at=None)
    enquiries.send_pending_emails()
    assert len(sent_to("ops@example.test")) == 1 and len(sent_to("two@example.test")) == 1
    del second


# ------------------------------------------------------------------ platform inbox

def make(**overrides):
    values = {"kind": "contact", "topic": "general", "name": "Amina Otieno", "email": "amina@example.org",
              "message": "Please tell me more about the mentor training.", **overrides}
    return enquiries.submit(**values)[0]


def test_only_platform_administrators_can_use_the_inbox(db, program):
    enquiry = make()
    anonymous = APIClient()
    assert anonymous.get("/api/v1/platform/enquiries").status_code in {401, 403}
    admin = User.objects.create_user("padmin@example.test", STRONG, first_name="P", last_name="A", role=Role.PROGRAM_ADMIN,
                                     status=Status.ACTIVE, program=program)
    client = APIClient()
    client.force_authenticate(admin)
    assert client.get("/api/v1/platform/enquiries").status_code == 403
    assert client.get(f"/api/v1/platform/enquiries/{enquiry.id}").status_code == 403
    assert client.post(f"/api/v1/platform/enquiries/{enquiry.id}/reply", {"body": "hi there"}, format="json").status_code == 403


def test_list_filters_search_and_counts(ops):
    make(name="Amina Otieno")
    pilot = make(kind="pilot", topic="pilot", name="Brian Mwangi", email="b@example.org", organisation="Nakuru Hospital",
                 message="We want a pilot in our maternity unit.")
    enquiries.set_status(actor=User.objects.get(email="ops@example.test"), enquiry=pilot, status="resolved", notify=False)

    data = ops.get("/api/v1/platform/enquiries").json()["data"]
    assert [r["name"] for r in data["results"]] == ["Amina Otieno"]
    assert data["counts"]["open"] == 1 and data["counts"]["new"] == 1 and data["counts"]["done"] == 1 and data["counts"]["unread"] == 2
    assert [r["name"] for r in ops.get("/api/v1/platform/enquiries?view=done").json()["data"]["results"]] == ["Brian Mwangi"]
    assert len(ops.get("/api/v1/platform/enquiries?view=done&kind=contact").json()["data"]["results"]) == 0
    assert ops.get("/api/v1/platform/enquiries?view=done&search=nakuru").json()["data"]["pagination"]["total"] == 1
    assert ops.get("/api/v1/platform/enquiries?assigned=unassigned").json()["data"]["pagination"]["total"] == 1


def test_opening_an_enquiry_marks_it_read_and_shows_the_timeline(ops):
    enquiry = make()
    detail = ops.get(f"/api/v1/platform/enquiries/{enquiry.id}").json()["data"]
    assert detail["reference"] == enquiry.reference and detail["message"].startswith("Please tell me")
    assert [e["type"] for e in detail["timeline"]] == ["received", "email"]  # the team alert is not on the timeline
    assert detail["timeline"][1]["email"]["status"] == "queued"
    assert ops.get("/api/v1/platform/enquiries").json()["data"]["counts"]["unread"] == 0
    assert ops.get(f"/api/v1/platform/enquiries/{enquiry.id}").status_code == 200
    assert ops.get("/api/v1/platform/enquiries/00000000-0000-0000-0000-000000000000").status_code == 404


def test_reply_emails_the_sender_logs_it_and_takes_ownership(ops, platform_admin):
    enquiry = make()
    response = ops.post(f"/api/v1/platform/enquiries/{enquiry.id}/reply",
                        {"body": "Thanks Amina. Mentor training is a 4-week online course. Shall we set up a call?"}, format="json")
    assert response.status_code == 200
    detail = response.json()["data"]
    assert detail["status"] == "waiting" and detail["assigned_to"]["name"] == "Ops Admin" and detail["overdue"] is False
    assert [e["type"] for e in detail["timeline"]][-1] == "reply"
    enquiries.send_pending_emails()
    reply = [m for m in sent_to("amina@example.org") if m.subject.startswith("Re:")][0]
    assert enquiry.reference in reply.subject and "4-week online course" in reply.body and "Ops" in reply.body
    assert "Please tell me more" in reply.body  # the original is quoted
    enquiry.refresh_from_db()
    assert enquiry.first_response_at is not None
    assert AuditEntry.objects.filter(action="platform.enquiry_replied", entity_id=enquiry.id).exists()


def test_status_changes_tell_the_sender_unless_the_admin_chooses_not_to(ops):
    enquiry = make()
    started = ops.post(f"/api/v1/platform/enquiries/{enquiry.id}/status", {"status": "in_progress"}, format="json")
    assert started.status_code == 200 and started.json()["data"]["status"] == "in_progress"
    resolved = ops.post(f"/api/v1/platform/enquiries/{enquiry.id}/status",
                        {"status": "resolved", "note": "Sent you the training brochure."}, format="json")
    assert resolved.json()["data"]["timeline"][-1]["meta"]["sender_notified"] is True
    quiet = ops.post(f"/api/v1/platform/enquiries/{enquiry.id}/status", {"status": "closed", "notify": False}, format="json")
    assert quiet.status_code == 200
    enquiries.send_pending_emails()
    subjects = [m.subject for m in sent_to("amina@example.org")]
    assert any("looking into" in s for s in subjects)
    resolved_mail = next(m for m in sent_to("amina@example.org") if "resolved" in m.subject.lower())
    assert "training brochure" in resolved_mail.body and enquiry.reference in resolved_mail.body
    assert not any("closed" in s.lower() for s in subjects)
    enquiry.refresh_from_db()
    assert enquiry.closed_at is not None


def test_spam_is_never_emailed_and_can_be_restored(ops):
    enquiry = make()
    EnquiryEvent.objects.all().delete()
    ops.post(f"/api/v1/platform/enquiries/{enquiry.id}/status", {"status": "spam"}, format="json")
    assert not EnquiryEvent.objects.filter(email_status="queued").exists()
    assert ops.post(f"/api/v1/platform/enquiries/{enquiry.id}/reply", {"body": "hello there"}, format="json").status_code == 409
    restored = ops.post(f"/api/v1/platform/enquiries/{enquiry.id}/status", {"status": "new", "notify": False}, format="json")
    assert restored.json()["data"]["status"] == "new"


def test_notes_stay_internal_assignment_and_priority_work(ops, platform_admin):
    enquiry = make()
    other = User.objects.create_superuser("two@example.test", STRONG, first_name="Two", last_name="Admin")
    assert ops.post(f"/api/v1/platform/enquiries/{enquiry.id}/notes", {"body": "Called the hospital; call back Friday."}, format="json").status_code == 200
    assert ops.post(f"/api/v1/platform/enquiries/{enquiry.id}/priority", {"priority": "high"}, format="json").json()["data"]["priority"] == "high"
    assigned = ops.post(f"/api/v1/platform/enquiries/{enquiry.id}/assign", {"user_id": str(other.id)}, format="json").json()["data"]
    assert assigned["assigned_to"]["id"] == str(other.id)
    assert ops.post(f"/api/v1/platform/enquiries/{enquiry.id}/assign", {"user_id": None}, format="json").json()["data"]["assigned_to"] is None
    nobody = User.objects.create_user("m@example.test", STRONG, first_name="M", last_name="M", role=Role.PROGRAM_ADMIN, status=Status.ACTIVE,
                                      program=Program.objects.create(name="X"))
    assert ops.post(f"/api/v1/platform/enquiries/{enquiry.id}/assign", {"user_id": str(nobody.id)}, format="json").status_code == 409
    enquiries.send_pending_emails()
    assert not any("Friday" in m.body for m in mail.outbox)  # notes never leave the building


def test_a_pilot_request_becomes_a_programme_and_the_sender_is_told(ops):
    enquiry = make(kind="pilot", topic="pilot", name="Brian Mwangi", email="brian@example.org", organisation="Nakuru Hospital",
                   message="We want a pilot in our maternity unit.")
    body = {"name": "Nakuru Pilot", "academic_year": "2027", "note": "Welcome aboard.",
            "admin": {"email": "brian@example.org", "first_name": "Brian", "last_name": "Mwangi"}}
    response = ops.post(f"/api/v1/platform/enquiries/{enquiry.id}/convert", body, format="json")
    assert response.status_code == 200
    detail = response.json()["data"]
    assert detail["status"] == "resolved" and detail["converted_programme"]["name"] == "Nakuru Pilot"
    programme = Program.objects.get(name="Nakuru Pilot")
    assert User.objects.get(email="brian@example.org").role == Role.PROGRAM_ADMIN
    assert User.objects.get(email="brian@example.org").program_id == programme.id
    enquiries.send_pending_emails()
    assert any("being set up" in m.subject.lower() for m in sent_to("brian@example.org"))
    again = ops.post(f"/api/v1/platform/enquiries/{enquiry.id}/convert", body, format="json")
    assert again.status_code == 409
    contact = make(email="c@example.org", message="A general question about the product.")
    assert ops.post(f"/api/v1/platform/enquiries/{contact.id}/convert", body, format="json").status_code == 409


def test_a_duplicate_programme_name_is_reported_and_leaves_the_enquiry_untouched(ops):
    Program.objects.create(name="Nakuru Pilot")
    enquiry = make(kind="pilot", topic="pilot")
    body = {"name": "Nakuru Pilot", "admin": {"email": "brian@example.org", "first_name": "Brian", "last_name": "Mwangi"}}
    response = ops.post(f"/api/v1/platform/enquiries/{enquiry.id}/convert", body, format="json")
    assert response.status_code == 409 and "already exists" in response.json()["error"]["message"]
    enquiry.refresh_from_db()
    assert enquiry.status == "new" and enquiry.converted_programme_id is None


def test_unanswered_enquiries_become_overdue_after_two_working_days(ops):
    enquiry = make()
    assert ops.get("/api/v1/platform/overview").json()["data"]["enquiries_overdue"] == 0
    Enquiry.objects.filter(id=enquiry.id).update(created_at=timezone.now() - timedelta(hours=49))
    overview = ops.get("/api/v1/platform/overview").json()["data"]
    assert overview["enquiries_overdue"] == 1 and overview["enquiries_new"] == 1
    assert ops.get("/api/v1/platform/enquiries").json()["data"]["results"][0]["overdue"] is True


def test_enquiry_actions_appear_in_platform_activity(ops):
    enquiry = make()
    ops.post(f"/api/v1/platform/enquiries/{enquiry.id}/reply", {"body": "Thanks, we will be in touch."}, format="json")
    titles = [(a["title"], a["subject"]) for a in ops.get("/api/v1/platform/activity").json()["data"]]
    assert ("Replied to a message", enquiry.reference) in titles
