import hashlib
import hmac
import json
import uuid

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity.models import Role, Status, User
from apps.core.models import OutboxEvent
from apps.notifications.models import Notification, NotificationPreference
from apps.notifications import services as notification_services


pytestmark = pytest.mark.django_db(transaction=True)


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_user_can_read_and_update_notification_preferences(student):
    client = APIClient()
    client.force_authenticate(user=student)

    initial = client.get("/api/v1/notification-preferences")
    assert initial.status_code == 200
    assert initial.json()["data"] == {
        "account_activity": True,
        "programme_updates": True,
        "placement_updates": True,
        "weekly_digest": False,
        "security_alerts": True,
    }

    updated = client.patch("/api/v1/notification-preferences", {
        "placement_updates": False,
        "weekly_digest": True,
        "security_alerts": False,
    }, format="json")
    assert updated.status_code == 200
    assert updated.json()["data"]["placement_updates"] is False
    assert updated.json()["data"]["weekly_digest"] is True
    assert updated.json()["data"]["security_alerts"] is True
    assert NotificationPreference.objects.get(user_id=student.id).placement_updates is False


def test_only_programme_admin_can_review_access_policies(program, coordinator):
    client = APIClient()
    client.force_authenticate(user=coordinator)
    assert client.get("/api/v1/access/policies").status_code == 403

    admin = User.objects.create_user(
        email="policy-admin@example.com", password="A-valid-password-123!",
        first_name="Policy", last_name="Admin", role=Role.PROGRAM_ADMIN,
        status=Status.ACTIVE, program=program,
    )
    client.force_authenticate(user=admin)
    response = client.get("/api/v1/access/policies")
    assert response.status_code == 200
    policies = {item["role"]: item for item in response.json()["data"]}
    assert policies[Role.PROGRAM_ADMIN]["mfa_required"] is True
    assert policies[Role.STUDENT]["scope"] == "institution"


def test_outbox_event_materialises_idempotent_safe_inbox_notification(student):
    event = OutboxEvent.objects.create(
        event_type="PlacementInvitationIssued",
        payload={"placement_id": "placement-1", "student_id": str(student.id)},
    )

    first = notification_services.create_for_event(event)
    second = notification_services.create_for_event(event)

    assert len(first) == len(second) == 1
    row = Notification.objects.get(event_id=event.id, user_id=student.id)
    assert row.template_key == "placement.invitation"
    assert row.payload == {"placement_id": "placement-1", "student_id": str(student.id)}
    assert notification_services.inbox(user=student, unread_only=True).count() == 1

    response = client_for(student).post(f"/api/v1/me/notifications/{row.id}/read")
    assert response.status_code == 200
    assert notification_services.inbox(user=student, unread_only=True).count() == 0


def test_user_can_mark_all_owned_notifications_read_without_touching_another_user(student, other_mentor):
    Notification.objects.create(
        user_id=student.id, event_id=uuid.uuid4(), event_type="PlacementInvitationIssued",
        template_key="placement.invitation", payload={},
    )
    Notification.objects.create(
        user_id=student.id, event_id=uuid.uuid4(), event_type="MentorAssigned",
        template_key="placement.mentor_assigned", payload={}, read_at=timezone.now(),
    )
    other = Notification.objects.create(
        user_id=other_mentor.id, event_id=uuid.uuid4(), event_type="MentorAssigned",
        template_key="placement.mentor_assigned", payload={},
    )

    response = client_for(student).post("/api/v1/me/notifications/read-all")

    assert response.status_code == 200
    assert response.json()["data"]["updated_count"] == 1
    assert notification_services.inbox(user=student, unread_only=True).count() == 0
    other.refresh_from_db()
    assert other.read_at is None


def test_high_safeguarding_event_routes_only_safe_recipient_identifiers(active_placement, student, coordinator, nurse_manager):
    from apps.safeguarding import services as safeguarding_services

    safeguarding_services.raise_concern(
        safeguarding_services.RaiseConcern(
            placement_id=active_placement.id,
            facility_id=None,
            category="learning_environment",
            severity="high",
            description="Restricted concern narrative for the reviewer.",
        ),
        actor=student,
    )
    event = OutboxEvent.objects.filter(event_type="EscalationRaised").latest("occurred_at")
    assert set(event.payload["recipient_user_ids"]) == {str(coordinator.id), str(nurse_manager.id)}
    assert "description" not in event.payload
    assert "action_taken" not in event.payload
    notification_services.create_for_event(event)
    assert Notification.objects.filter(event_id=event.id).count() == 2
    assert not Notification.objects.filter(event_id=event.id, user_id=student.id).exists()


def test_mailtrap_webhook_requires_signature_and_updates_delivery_status(student):
    event = OutboxEvent.objects.create(
        event_type="PlacementInvitationIssued",
        payload={"student_id": str(student.id)},
    )
    row = notification_services.create_for_event(event)[0]
    body = json.dumps({"id": "provider-event-1", "event": "bounced", "notification_id": str(row.id)}).encode()
    with override_settings(MAILTRAP_WEBHOOK_SECRET="test-webhook-secret"):
        client = client_for(student)
        assert client.post("/api/v1/webhooks/mailtrap", data=body, content_type="application/json").status_code == 401
        signature = hmac.new(b"test-webhook-secret", body, hashlib.sha256).hexdigest()
        response = client.post(
            "/api/v1/webhooks/mailtrap", data=body, content_type="application/json",
            HTTP_X_MAILTRAP_SIGNATURE=signature,
        )
    assert response.status_code == 200
    row.refresh_from_db()
    assert row.provider_status == "bounced"
    assert row.status == Notification.STATUS_FAILED


def test_weekly_digest_is_opt_in_and_throttled(student):
    event = OutboxEvent.objects.create(
        event_type="PlacementInvitationIssued",
        payload={"student_id": str(student.id)},
    )
    notification_services.create_for_event(event)
    preference = NotificationPreference.objects.create(user_id=student.id, weekly_digest=True)
    from apps.notifications.tasks import send_weekly_digest_task

    send_weekly_digest_task.run()
    preference.refresh_from_db()
    assert preference.last_digest_at is not None


def test_mentor_profile_is_owned_by_the_mentor_and_validated(mentor, student):
    from rest_framework.test import APIClient

    client = APIClient()
    client.force_authenticate(mentor)
    saved = client.patch(
        "/api/v1/mentor/profile",
        {"cadre": "Registered nurse-midwife", "department": "Labour ward", "years_of_practice": 9,
         "mentorship_experience_years": 3, "digital_literacy": 4},
        format="json",
    )
    assert saved.status_code == 200, saved.content
    assert client.get("/api/v1/mentor/profile").json()["data"]["department"] == "Labour ward"
    assert client.patch("/api/v1/mentor/profile", {"digital_literacy": 9}, format="json").status_code == 400
    other = APIClient()
    other.force_authenticate(student)
    assert other.get("/api/v1/mentor/profile").status_code == 404


def test_recipients_who_were_not_emailed_are_not_recorded_as_sent(active_placement, student, coordinator, nurse_manager):
    """Plan §6B N4: only people actually emailed are 'sent'; the rest keep the in-app item as 'not emailed'."""
    from django.core.management import call_command

    from apps.identity.models import Status
    from apps.notifications.models import Notification
    from apps.safeguarding import services as safeguarding_services

    safeguarding_services.raise_concern(
        safeguarding_services.RaiseConcern(
            placement_id=active_placement.id, facility_id=None, category="Wellbeing", severity="medium",
            description="Restricted concern narrative for the reviewer.", routed_to="both",
        ),
        actor=student,
    )
    event = OutboxEvent.objects.filter(event_type="EscalationRaised").latest("occurred_at")
    type(coordinator).objects.filter(id=coordinator.id).update(status=Status.SUSPENDED)  # skipped by the email loop
    call_command("dispatch_outbox", verbosity=0)
    statuses = dict(Notification.objects.filter(event_id=event.id).values_list("user_id", "status"))
    assert statuses[nurse_manager.id] == Notification.STATUS_SENT
    assert statuses[coordinator.id] == Notification.STATUS_NOT_EMAILED


def test_outgoing_email_carries_only_the_notification_id_for_provider_callbacks(active_placement, student, nurse_manager):
    """Plan §6B N9: provider delivery/bounce callbacks need a correlation id; it must be opaque."""
    from django.core import mail
    from django.core.management import call_command

    from apps.notifications.models import Notification
    from apps.safeguarding import services as safeguarding_services

    safeguarding_services.raise_concern(
        safeguarding_services.RaiseConcern(
            placement_id=active_placement.id, facility_id=None, category="Wellbeing", severity="low",
            description="Restricted concern narrative for the reviewer.", routed_to="nurse_manager",
        ),
        actor=student,
    )
    call_command("dispatch_outbox", verbosity=0)
    sent = [message for message in mail.outbox if nurse_manager.email in message.to]
    assert len(sent) == 1
    notification = Notification.objects.get(user_id=nurse_manager.id, event_type="EscalationRaised")
    assert sent[0].extra_headers["X-MentorMAMA-Notification"] == str(notification.id)
    assert "Restricted concern narrative" not in sent[0].body
