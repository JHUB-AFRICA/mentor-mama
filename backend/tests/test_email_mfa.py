import uuid

from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import OutboxEvent
from apps.identity import authentication
from apps.notifications.email import deliver_outbox_event
from django_otp.plugins.otp_email.models import EmailDevice


def test_email_mfa_challenge_is_delivered_without_putting_code_in_outbox(db, coordinator):
    coordinator.email_verified_at = timezone.now()
    coordinator.save(update_fields=["email_verified_at"])
    authentication.enable_email_mfa(user=coordinator)

    client = APIClient()
    client.force_authenticate(coordinator)
    response = client.post(
        "/api/v1/auth/mfa/email/challenge",
        {},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )

    assert response.status_code == 202
    device = EmailDevice.objects.get(user=coordinator, name="login-email")
    event = OutboxEvent.objects.get(event_type="EmailMFAChallengeRequested")
    assert event.payload == {"user_id": str(coordinator.id), "device_id": device.id}
    assert device.token not in str(event.payload)
    deliver_outbox_event(event)
    assert len(mail.outbox) == 1
    assert device.token in mail.outbox[0].body
    assert mail.outbox[0].alternatives == []


def test_email_mfa_verification_is_single_use(db, coordinator):
    coordinator.email_verified_at = timezone.now()
    coordinator.save(update_fields=["email_verified_at"])
    authentication.enable_email_mfa(user=coordinator)
    device = authentication.request_email_mfa_challenge(user=coordinator)
    code = device.token

    client = APIClient()
    client.force_authenticate(coordinator)
    first = client.post(
        "/api/v1/auth/mfa/email/verify",
        {"code": code},
        format="json",
    )
    second = client.post(
        "/api/v1/auth/mfa/email/verify",
        {"code": code},
        format="json",
    )

    assert first.status_code == 200
    assert second.status_code == 400
    assert client.session[authentication.MFA_VERIFIED_SESSION_KEY] is True


def _security_email(user, action):
    from apps.identity.models import Status

    event = OutboxEvent.objects.create(event_type="SecurityNotificationRequested", payload={"user_id": str(user.id), "action": action})
    if action in {"account_suspended", "account_deactivated"}:
        user.status = Status.SUSPENDED if action == "account_suspended" else Status.DEACTIVATED
        user.save(update_fields=["status"])
    mail.outbox.clear()
    deliver_outbox_event(event)
    assert len(mail.outbox) == 1
    return mail.outbox[0].body


def test_suspended_and_deactivated_emails_carry_no_dead_link(db, coordinator):
    for action in ("account_suspended", "account_deactivated"):
        body = _security_email(coordinator, action)
        assert "http" not in body and "Open account" not in body, body  # they cannot sign in, so no link into the app
        assert "programme support team" in body


def test_other_security_emails_link_to_the_roles_real_account_page(db, coordinator):
    body = _security_email(coordinator, "password_changed")
    assert "/coordinator/account?tab=security" in body and "/settings" not in body


def test_reactivation_email_links_to_sign_in(db, coordinator):
    body = _security_email(coordinator, "account_active")
    assert "Sign in:" in body and "/settings" not in body
