"""Audit writer. Every write records one, in the same transaction (TX-03)."""

from __future__ import annotations

from uuid import UUID

from apps.core.models import AuditEntry


def record(
    *,
    actor,
    action: str,
    entity_table: str,
    entity_id: UUID,
    scope: dict | None = None,
    changes: dict | None = None,
    override_reason: str | None = None,
) -> AuditEntry:
    if actor is None:
        from apps.core.errors import UnattributedWrite

        raise UnattributedWrite()
    return AuditEntry.objects.create(
        actor=actor,
        actor_role=actor.role,
        scope=scope or {},
        action=action,
        entity_table=entity_table,
        entity_id=entity_id,
        changes=changes,
        is_override=override_reason is not None,
        override_reason=override_reason,
    )
