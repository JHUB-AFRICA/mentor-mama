

def test_resend_callbacks_update_the_notification_matched_by_provider_message_id(db):
    import uuid

    from apps.notifications import services
    from apps.notifications.models import Notification

    row = Notification.objects.create(user_id=uuid.uuid4(), event_id=uuid.uuid4(), event_type="PasswordResetRequested",
                                      template_key="x", provider_message_id="re_abc123")
    updated = services.record_anymail_event(event_type="delivered", message_id="re_abc123", metadata={}, event_id="evt-1")
    row.refresh_from_db()
    assert updated is not None and row.provider_status == "delivered" and row.status == "sent"
    # A late 'sent' callback must not undo a delivered state.
    services.record_anymail_event(event_type="sent", message_id="re_abc123", metadata={}, event_id="evt-0")
    row.refresh_from_db()
    assert row.provider_status == "delivered"
    services.record_anymail_event(event_type="bounced", message_id="re_abc123", metadata={}, event_id="evt-2")
    row.refresh_from_db()
    assert row.provider_status == "bounced" and row.status == "failed"
    # Opens, unknown ids and unknown types are ignored.
    assert services.record_anymail_event(event_type="opened", message_id="re_abc123", metadata={}, event_id="e") is None
    assert services.record_anymail_event(event_type="delivered", message_id="re_nope", metadata={}, event_id="e") is None
    # By our own id from metadata.
    other = Notification.objects.create(user_id=uuid.uuid4(), event_id=uuid.uuid4(), event_type="PasswordResetRequested", template_key="x")
    assert services.record_anymail_event(event_type="delivered", message_id="", metadata={"notification_id": str(other.id)}, event_id="e").id == other.id


def test_resend_webhook_is_closed_without_a_signing_secret_and_rejects_bad_signatures(client, settings):
    settings.RESEND_SIGNING_SECRET = ""
    assert client.post("/anymail/resend/tracking/", data="{}", content_type="application/json").status_code == 404
    settings.RESEND_SIGNING_SECRET = "whsec_" + "dGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQ="
    settings.ANYMAIL = {**settings.ANYMAIL, "RESEND_SIGNING_SECRET": settings.RESEND_SIGNING_SECRET}
    bad = client.post("/anymail/resend/tracking/", data='{"type": "email.delivered"}', content_type="application/json",
                      HTTP_SVIX_ID="msg_1", HTTP_SVIX_TIMESTAMP="1700000000", HTTP_SVIX_SIGNATURE="v1,wrong")
    assert bad.status_code in {400, 401, 403}


def test_email_provider_defaults_to_console_and_resend_needs_a_key(monkeypatch):
    import importlib

    from django.core.exceptions import ImproperlyConfigured

    import config.settings.base as base

    assert base.EMAIL_PROVIDER in {"console", "mailtrap", "resend"}
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "")
    try:
        with __import__("pytest").raises(ImproperlyConfigured):
            importlib.reload(base)
    finally:
        monkeypatch.delenv("EMAIL_PROVIDER")
        importlib.reload(base)
