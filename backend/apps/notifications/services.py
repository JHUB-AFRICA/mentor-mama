import uuid

from django.db import models, transaction
from django.utils import timezone

from apps.notifications.models import Notification, NotificationPreference


@transaction.atomic
def get_preferences(*, user):
    preferences, _ = NotificationPreference.objects.get_or_create(user_id=user.id)
    return preferences


@transaction.atomic
def update_preferences(*, user, **changes):
    preferences = get_preferences(user=user)
    for field, value in changes.items():
        setattr(preferences, field, value)
    preferences.save(update_fields=[*changes.keys(), "updated_at"])
    return preferences


EVENT_TEMPLATES = {
    "IdentityInvitationRequested": "account.invitation",
    "PasswordResetRequested": "account.password_reset",
    "EmailVerificationRequested": "account.email_verification",
    "SecurityNotificationRequested": "account.security",
    "PlacementInvitationIssued": "placement.invitation",
    "PlacementAcknowledgementReminderRequested": "placement.acknowledgement_reminder",
    "MentorAssigned": "placement.mentor_assigned",
    "MentorPlacementsAssigned": "placement.mentor_batch_assigned",
    "PlacementsArranged": "placement.arranged",
    "PlacementsRequested": "placement.requested",
    "MentorReassigned": "placement.mentor_reassigned",
    "ArrangementOverridden": "placement.arrangement_overridden",
    "PlacementsDeclined": "placement.requests_declined",
    "MentorUnavailableForPlacements": "placement.mentor_unavailable",
    "PlacementRequestsWithdrawn": "placement.requests_withdrawn",
    "PlacementProvisionalNotice": "placement.provisional_notice",
    "PlacementStartsSoon": "placement.starts_soon",
    "EscalationRaised": "safeguarding.concern_raised",
    "FeedbackSubmitted": "feedback.received",
    "SessionLogged": "mentorship.follow_up",
    "FinalAssessmentSubmitted": "assessment.final_submitted",
    "PlacementPaused": "placement.paused",
    "PlacementResumed": "placement.resumed",
    "PlacementWithdrawn": "placement.withdrawn",
    "PlacementCompleted": "placement.completed",
    "PlacementScheduled": "placement.scheduled",
    "OrientationAcknowledged": "placement.orientation_acknowledged",
    "InductionCompleted": "placement.induction_completed",
    "EscalationStatusChanged": "safeguarding.status_changed",
    "DataRequestSubmitted": "privacy.request_submitted",
    "DataRequestStatusChanged": "privacy.request_status_changed",
}


def _recipient_ids(event) -> list[str]:
    payload = event.payload
    explicit = payload.get("recipient_user_ids") or []
    if explicit:
        return list(dict.fromkeys(str(value) for value in explicit))
    if event.event_type == "MentorReassigned":
        return list(dict.fromkeys(str(value) for value in (
            payload.get("mentor_id"), payload.get("previous_mentor_id"),
        ) if value))
    for key in ("user_id", "student_id", "mentor_id"):
        if payload.get(key):
            return [str(payload[key])]
    return []


@transaction.atomic
def create_for_event(event):
    """Materialise safe inbox rows for one outbox event, idempotently."""
    template_key = EVENT_TEMPLATES.get(event.event_type)
    if not template_key:
        return []
    payload = dict(event.payload)
    payload.pop("recipient_user_ids", None)
    rows = []
    for user_id in _recipient_ids(event):
        row, _ = Notification.objects.get_or_create(
            event_id=event.id,
            user_id=user_id,
            template_key=template_key,
            defaults={
                "event_type": event.event_type,
                "payload": payload,
            },
        )
        rows.append(row)
    return rows


def mark_delivered(event_id, *, error: str | None = None, emailed_user_ids=None):
    """Record the outcome per recipient.

    `emailed_user_ids` is the set actually emailed for multi-recipient events; everyone else's in-app row is marked
    "not emailed" rather than "sent" (plan §6B N4). `None` means the event has no per-recipient record.
    """
    rows = Notification.objects.filter(event_id=event_id)
    values = {"attempts": models.F("attempts") + 1}
    if error:
        rows.update(**values, status=Notification.STATUS_FAILED, last_error=error[:500])
        return
    if emailed_user_ids is None:
        rows.update(**values, status=Notification.STATUS_SENT, delivered_at=timezone.now(), last_error="")
        return
    emailed = [str(user_id) for user_id in emailed_user_ids]
    rows.filter(user_id__in=emailed).update(**values, status=Notification.STATUS_SENT, delivered_at=timezone.now(), last_error="")
    rows.exclude(user_id__in=emailed).update(**values, status=Notification.STATUS_NOT_EMAILED, last_error="")


@transaction.atomic
def record_provider_event(*, notification_id, status: str, provider_event_id: str):
    """Apply a normalized provider callback without trusting provider content."""
    normalized = status.lower().strip()
    if normalized not in {"accepted", "delivered", "bounced", "failed"}:
        return None
    row = Notification.objects.select_for_update().filter(id=notification_id).first()
    if row is None:
        return None
    row.provider_status = normalized
    row.provider_event_id = provider_event_id[:180]
    if normalized in {"bounced", "failed"}:
        row.status = Notification.STATUS_FAILED
    else:
        row.status = Notification.STATUS_SENT
    row.save(update_fields=["provider_status", "provider_event_id", "status", "updated_at"])
    return row


def inbox(*, user, unread_only=False):
    rows = Notification.objects.filter(user_id=user.id)
    if unread_only:
        rows = rows.filter(read_at=None)
    return rows.order_by("-created_at")


@transaction.atomic
def mark_read(*, user, notification_id):
    row = Notification.objects.select_for_update().filter(id=notification_id, user_id=user.id).first()
    if row and row.read_at is None:
        row.read_at = timezone.now()
        row.save(update_fields=["read_at", "updated_at"])
    return row


@transaction.atomic
def mark_all_read(*, user):
    return Notification.objects.filter(user_id=user.id, read_at=None).update(read_at=timezone.now())


#: Resend/Anymail event types that change what we show. Opens and clicks are ignored (no tracking).
_ANYMAIL_STATUS = {
    "queued": "accepted", "sent": "accepted", "delivered": "delivered",
    "bounced": "bounced", "rejected": "failed", "failed": "failed", "complained": "bounced",
}


def record_anymail_event(*, event_type: str, message_id: str, metadata: dict, event_id: str):
    """Apply a verified delivery callback. Matches by our notification id when present, else by the provider's id."""
    status = _ANYMAIL_STATUS.get(event_type)
    if status is None:
        return None
    notification_id = (metadata or {}).get("notification_id")
    row = None
    if notification_id:
        try:
            row = Notification.objects.filter(id=uuid.UUID(str(notification_id))).first()
        except ValueError:
            row = None
    if row is None and message_id:
        row = Notification.objects.filter(provider_message_id=message_id).first()
    if row is None:
        return None
    if status == "accepted" and row.provider_status in {"delivered", "bounced", "failed"}:
        return row  # callbacks can arrive out of order; never walk a final state back
    with transaction.atomic():
        return record_provider_event(notification_id=row.id, status=status, provider_event_id=event_id or message_id or "")
