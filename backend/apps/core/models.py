"""Platform tables. No domain concepts live here (Stage 4 §4.1)."""

import uuid

from django.db import models


def new_id() -> uuid.UUID:
    """UUID primary key (ADR 0006).

    uuid4 today; swap for a uuid7 generator when the stdlib or a vetted
    dependency provides one. Callers must not depend on ordering yet.
    """
    return uuid.uuid4()


class BaseModel(models.Model):
    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AuditEntry(models.Model):
    """Append-only. WFR-030/031 — see ADR 0007."""

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    occurred_at = models.DateTimeField(auto_now_add=True)
    actor = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="audit_entries")
    actor_role = models.CharField(max_length=32)
    scope = models.JSONField(default=dict)
    action = models.CharField(max_length=64)
    entity_table = models.CharField(max_length=64)
    entity_id = models.UUIDField()
    changes = models.JSONField(null=True, blank=True)
    is_override = models.BooleanField(default=False)
    override_reason = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "core_audit_entry"
        indexes = [
            models.Index(fields=["entity_table", "entity_id", "-occurred_at"]),
            models.Index(fields=["actor", "-occurred_at"]),
        ]
        constraints = [
            # WFR-033: an override without a reason cannot be recorded at all.
            models.CheckConstraint(
                check=models.Q(is_override=False) | ~models.Q(override_reason=None),
                name="audit_override_needs_reason",
            )
        ]


class OutboxEvent(models.Model):
    """Transactional outbox (ADR 0004)."""

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    occurred_at = models.DateTimeField(auto_now_add=True)
    event_type = models.CharField(max_length=64)
    payload = models.JSONField()
    dispatched_at = models.DateTimeField(null=True, blank=True)
    attempts = models.SmallIntegerField(default=0)
    last_error = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "core_outbox_event"
        indexes = [
            models.Index(
                fields=["occurred_at"],
                condition=models.Q(dispatched_at=None),
                name="outbox_pending_idx",
            )
        ]


class IdempotencyKey(models.Model):
    """Client-generated command id (ADR 0012). PK, so a replay is a PK conflict."""

    command_id = models.UUIDField(primary_key=True, editable=False)
    actor = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="+")
    command_type = models.CharField(max_length=64)
    result_ref = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "core_idempotency_key"
