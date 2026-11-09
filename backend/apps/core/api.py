"""Public surface of the core module (MA-11)."""

from django.db.models import QuerySet

from apps.core import audit, idempotency, outbox
from apps.core.errors import DomainError, translate_integrity_error  # noqa: F401
from apps.core.models import OutboxEvent
from apps.core.models import AuditEntry


def pending_outbox_events(*, limit: int = 50) -> QuerySet:
    """Read pending events for a dispatcher without exposing the core model."""
    return OutboxEvent.objects.filter(dispatched_at__isnull=True).order_by("occurred_at")[:limit]


def lock_outbox_event(event_id):
    """Lock one event for delivery through the core boundary."""
    return OutboxEvent.objects.select_for_update().get(id=event_id)


def audit_count(*, scope: dict) -> int:
    """Return a scoped audit count without exposing the audit table."""
    return AuditEntry.objects.filter(scope__program_id=str(scope["program_id"])).count()
