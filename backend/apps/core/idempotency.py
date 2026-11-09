"""Idempotency (ADR 0012).

The command id is the primary key, so a replay is a primary-key conflict inside
the same transaction as the business write: it cannot be half-applied.
"""

from __future__ import annotations

from uuid import UUID

from django.db import IntegrityError, transaction

from apps.core.models import IdempotencyKey


class Replayed(Exception):
    """Raised when a command id has already been applied."""

    def __init__(self, result_ref: UUID | None):
        self.result_ref = result_ref
        super().__init__(f"replayed: {result_ref}")


def claim(*, command_id: UUID, actor, command_type: str) -> IdempotencyKey:
    """Claim a command id safely under concurrent retries.

    The primary key is the arbiter.  The savepoint is essential: PostgreSQL
    marks the surrounding transaction failed after a unique violation, so the
    winner's row can only be read after rolling back this small inner block.
    """
    try:
        with transaction.atomic():
            return IdempotencyKey.objects.create(
                command_id=command_id, actor=actor, command_type=command_type
            )
    except IntegrityError:
        existing = IdempotencyKey.objects.get(command_id=command_id)
        if existing.actor_id != actor.id or existing.command_type != command_type:
            from apps.core.errors import IdempotencyKeyReused

            raise IdempotencyKeyReused()
        if existing.result_ref is None:
            from apps.core.errors import CommandInProgress

            raise CommandInProgress()
        raise Replayed(existing.result_ref)


def record_result(key: IdempotencyKey, result_id: UUID) -> None:
    key.result_ref = result_id
    key.save(update_fields=["result_ref"])
