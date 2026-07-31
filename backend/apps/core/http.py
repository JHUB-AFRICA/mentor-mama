"""HTTP plumbing shared by the API layer.

Views stay thin: parse, delegate, serialise, map errors (§2.1 of the rules).
"""

from __future__ import annotations

import uuid

from django.db import IntegrityError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from apps.core import idempotency
from apps.core.errors import DomainError, IdempotencyKeyRequired, translate_integrity_error


def domain_exception_handler(exc, context):
    """Render domain errors, and translate constraint violations (DB-01, ERR-01)."""
    if isinstance(exc, DomainError):
        return Response(exc.as_dict(), status=exc.status)
    if isinstance(exc, IntegrityError):
        translated = translate_integrity_error(exc)
        if translated is not None:
            return Response(translated.as_dict(), status=translated.status)
        # Unmapped constraint: re-raise so it surfaces loudly rather than as a
        # silent 400. A contract test asserts every constraint is mapped.
        raise exc
    return drf_exception_handler(exc, context)


def require_command_id(request) -> uuid.UUID:
    """Idempotency-Key is required on every state-changing request (ADR 0012)."""
    raw = request.headers.get("Idempotency-Key")
    if not raw:
        raise IdempotencyKeyRequired()
    try:
        return uuid.UUID(raw)
    except ValueError as exc:
        raise IdempotencyKeyRequired("Idempotency-Key must be a UUID.") from exc


class IdempotentCommand:
    """Wraps a command so a replay returns the original result (ADR 0012)."""

    def __init__(self, request, command_type: str):
        self.command_id = require_command_id(request)
        self.actor = request.user
        self.command_type = command_type
        self.key = None
        self.replayed = False
        self.result_ref = None

    def __enter__(self):
        try:
            self.key = idempotency.claim(
                command_id=self.command_id, actor=self.actor, command_type=self.command_type
            )
        except idempotency.Replayed as replay:
            self.replayed = True
            self.result_ref = replay.result_ref
        return self

    def __exit__(self, *exc):
        return False

    def record(self, result_id):
        if self.key is not None:
            idempotency.record_result(self.key, result_id)
