"""Public surface of safeguarding (MA-11)."""

from __future__ import annotations

from uuid import UUID

from apps.safeguarding.models import Escalation, EscalationState


def open_count(placement_id: UUID) -> int:
    """Counts only. Content never crosses this boundary (INV-13)."""
    return Escalation.objects.filter(placement_id=placement_id).exclude(
        state=EscalationState.CLOSED
    ).count()
