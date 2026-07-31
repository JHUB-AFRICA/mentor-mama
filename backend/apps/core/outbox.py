"""Transactional outbox (ADR 0004).

Events are written inside the business transaction and dispatched after commit.
Payloads carry identifiers only — a database trigger rejects restricted content
(EV-01, WFR-025).
"""

from __future__ import annotations

from dataclasses import asdict, is_dataclass

from apps.core.models import OutboxEvent


def publish(*events) -> list[OutboxEvent]:
    rows = []
    for event in events:
        payload = asdict(event) if is_dataclass(event) else dict(event.payload)
        payload = {k: (str(v) if v is not None else None) for k, v in payload.items()}
        rows.append(
            OutboxEvent.objects.create(
                event_type=type(event).__name__,
                payload=payload,
            )
        )
    return rows
