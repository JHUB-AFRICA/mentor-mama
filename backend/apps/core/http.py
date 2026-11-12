"""HTTP plumbing shared by the API layer.

Views stay thin: parse, delegate, serialise, map errors (§2.1 of the rules).
"""

from __future__ import annotations

import uuid
import logging

from django.db import IntegrityError
from django.db import transaction
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.views import exception_handler as drf_exception_handler

from apps.core import idempotency
from apps.core.errors import DomainError, IdempotencyKeyRequired, translate_integrity_error

logger = logging.getLogger(__name__)


FIELD_LABELS = {"non_field_errors": "", "detail": "", "new_password": "New password", "current_password": "Current password"}


def _first_text(value):
    if isinstance(value, dict):
        for inner in value.values():
            text = _first_text(inner)
            if text:
                return text
        return ""
    if isinstance(value, (list, tuple)):
        texts = [_first_text(item) for item in value]
        return " ".join(text for text in texts if text)
    return str(value)


def validation_message(fields: dict) -> str:
    """A short, readable sentence from DRF field errors: "Contact email: Enter a valid email address." """
    for field, value in fields.items():
        text = _first_text(value)
        if not text:
            continue
        label = FIELD_LABELS.get(field, str(field).replace("_", " ").capitalize())
        return f"{label}: {text}" if label else text
    return "Check the highlighted information and try again."


def domain_exception_handler(exc, context):
    """Render domain errors, and translate constraint violations (DB-01, ERR-01)."""
    if isinstance(exc, DomainError):
        if exc.status >= 500:
            logger.error("Internal domain error: %s", exc.code)
            return Response({"error": {
                "code": exc.code,
                "message": "MentorMAMA is having a brief problem. Please try again shortly.",
                "retryable": True,
            }}, status=exc.status)
        return Response(exc.as_dict(), status=exc.status)
    if isinstance(exc, IntegrityError):
        translated = translate_integrity_error(exc)
        if translated is not None:
            return Response(translated.as_dict(), status=translated.status)
        # Keep unexpected database details in server logs only. Contract tests
        # still assert all known constraints are mapped to domain errors.
        logger.error("Unhandled database integrity error", exc_info=(type(exc), exc, exc.__traceback__))
        return Response({"error": {
            "code": "InternalError",
            "message": "MentorMAMA is having a brief problem. Please try again shortly.",
            "retryable": True,
        }}, status=500)
    response = drf_exception_handler(exc, context)
    if response is not None:
        if isinstance(exc, ValidationError) and isinstance(response.data, (dict, list)) and "error" not in (response.data if isinstance(response.data, dict) else {}):
            # Keep DRF's field details (clients and tests read them) and add the envelope the portal shows,
            # so people see the real reason ("This password is too common.") instead of a generic message.
            fields = response.data if isinstance(response.data, dict) else {"non_field_errors": response.data}
            response.data = {**fields, "error": {"code": "ValidationError", "message": validation_message(fields), "fields": fields}}
        return response

    # DRF's default handler returns None for unexpected exceptions, which lets
    # Django's DEBUG page (including traceback and local paths) escape from API
    # endpoints. Keep diagnostics in server logs and return a stable contract.
    logger.error(
        "Unhandled API exception",
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    return Response(
        {"error": {
            "code": "InternalError",
            "message": "MentorMAMA is having a brief problem. Please try again shortly.",
            "retryable": True,
        }},
        status=500,
    )


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
        # The idempotency row, domain write, audit row and outbox event are one
        # commit.  Nested service transactions are savepoints, not new commits.
        self._transaction = transaction.atomic()
        self._transaction.__enter__()
        try:
            self.key = idempotency.claim(
                command_id=self.command_id, actor=self.actor, command_type=self.command_type
            )
        except idempotency.Replayed as replay:
            self.replayed = True
            self.result_ref = replay.result_ref
        except BaseException as exc:
            # If __enter__ itself raises, Python never calls __exit__.  Close
            # the outer command transaction explicitly or that failed request
            # poisons Django's connection for the next one.
            self._transaction.__exit__(type(exc), exc, exc.__traceback__)
            raise
        return self

    def __exit__(self, exc_type, exc, traceback):
        return self._transaction.__exit__(exc_type, exc, traceback)

    def record(self, result_id):
        if self.key is not None:
            idempotency.record_result(self.key, result_id)
