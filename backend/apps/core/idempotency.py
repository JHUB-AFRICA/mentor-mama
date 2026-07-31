"""Idempotency (ADR 0012).

The command id is the primary key, so a replay is a primary-key conflict inside
the same transaction as the business write: it cannot be half-applied.
"""

from __future__ import annotations

from uuid import UUID

from apps.core.models import IdempotencyKey


class Replayed(Exception):
    """Raised when a command id has already been applied."""

    def __init__(self, result_ref: UUID | None):
        self.result_ref = result_ref
        super().__init__(f"replayed: {result_ref}")


def claim(*, command_id: UUID, actor, command_type: str) -> IdempotencyKey:
    """Claim a command id, or raise Replayed with the original result."""
    existing = IdempotencyKey.objects.filter(command_id=command_id).first()
    if existing is not None:
        if existing.command_type != command_type:
            from apps.core.errors import IdempotencyKeyReused

            raise IdempotencyKeyReused()
        raise Replayed(existing.result_ref)
    return IdempotencyKey.objects.create(
        command_id=command_id, actor=actor, command_type=command_type
    )


def record_result(key: IdempotencyKey, result_id: UUID) -> None:
    key.result_ref = result_id
    key.save(update_fields=["result_ref"])
