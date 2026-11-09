"""Automatic background delivery tasks."""

from datetime import timedelta

from celery import shared_task
from django.core.management import call_command
from django.db import transaction
from django.db import models
from django.utils import timezone


@shared_task(bind=True, max_retries=5, default_retry_delay=30)
def dispatch_outbox_task(self):
    """Reconcile durable outbox rows; the command remains useful locally."""
    try:
        call_command("dispatch_outbox", limit=50)
    except Exception as exc:
        raise self.retry(exc=exc) from exc


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def send_weekly_digest_task(self):
    """Send opt-in safe notification summaries once per seven-day window."""
    from apps.identity import api as identity
    from apps.notifications.email import send_digest_email
    from apps.notifications.models import Notification, NotificationPreference

    cutoff = timezone.now() - timedelta(days=7)
    preferences = NotificationPreference.objects.filter(weekly_digest=True).filter(
        models.Q(last_digest_at=None) | models.Q(last_digest_at__lt=cutoff)
    )
    for preference in preferences.iterator():
        user = identity.user_of(preference.user_id)
        if user is None or not identity.is_active(user.id):
            continue
        unread_count = Notification.objects.filter(user_id=user.id, read_at=None).count()
        if unread_count == 0:
            with transaction.atomic():
                preference.last_digest_at = timezone.now()
                preference.save(update_fields=["last_digest_at", "updated_at"])
            continue
        try:
            send_digest_email(user=user, unread_count=unread_count)
        except Exception as exc:
            raise self.retry(exc=exc) from exc
        with transaction.atomic():
            preference.last_digest_at = timezone.now()
            preference.save(update_fields=["last_digest_at", "updated_at"])
