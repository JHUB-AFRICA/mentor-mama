"""User notification preferences owned by the notifications module."""

from django.db import models

from apps.core.models import BaseModel


class NotificationPreference(BaseModel):
    """Email preferences; security messages are always enabled."""

    # Notifications is a leaf module; keep the identity relation as a bounded
    # identifier so it cannot create an upward FK dependency.
    user_id = models.UUIDField(unique=True)
    account_activity = models.BooleanField(default=True)
    programme_updates = models.BooleanField(default=True)
    placement_updates = models.BooleanField(default=True)
    weekly_digest = models.BooleanField(default=False)
    last_digest_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notifications_preference"


class Notification(BaseModel):
    """A safe per-recipient notification created from a committed outbox event.

    This is deliberately identifier-only. It is not a copy of domain records and
    cannot become a back door for safeguarding or free-text session content.
    """

    STATUS_QUEUED = "queued"
    STATUS_SENT = "sent"
    STATUS_FAILED = "failed"
    # In-app only: the email was skipped (preference opt-out or inactive account). Never reported as "sent".
    STATUS_NOT_EMAILED = "not_emailed"
    STATUS_CHOICES = [(STATUS_QUEUED, "Queued"), (STATUS_SENT, "Sent"), (STATUS_FAILED, "Failed"), (STATUS_NOT_EMAILED, "Not emailed")]

    user_id = models.UUIDField()
    event_id = models.UUIDField()
    event_type = models.CharField(max_length=64)
    template_key = models.CharField(max_length=100)
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_QUEUED)
    attempts = models.PositiveSmallIntegerField(default=0)
    last_error = models.CharField(max_length=500, blank=True, default="")
    read_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    provider_event_id = models.CharField(max_length=180, blank=True, default="")
    provider_status = models.CharField(max_length=32, blank=True, default="")
    #: The email provider's id for the message (Resend `email_id`); how delivery callbacks find this row.
    provider_message_id = models.CharField(max_length=120, blank=True, default="", db_index=True)

    class Meta:
        db_table = "notifications_notification"
        constraints = [
            models.UniqueConstraint(
                fields=["event_id", "user_id", "template_key"],
                name="one_notification_per_event_recipient_template",
            )
        ]
        indexes = [
            models.Index(fields=["user_id", "read_at", "-created_at"], name="notification_inbox_idx"),
            models.Index(fields=["event_id"], name="notification_event_idx"),
        ]
