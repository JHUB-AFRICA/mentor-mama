"""INV-07 as a completion blocker (ADR 0003).

Deliberately a synchronous query rather than an event-maintained counter: a
dispatch lag of one second would let a placement be signed off with an open
safeguarding concern.
"""

from __future__ import annotations

from uuid import UUID

from apps.placements.ports import BlockReason
from apps.safeguarding.models import Escalation, EscalationState


class OpenEscalationBlocker:
    name = "open_escalation"

    def blocks(self, placement_id: UUID) -> BlockReason | None:
        open_rows = Escalation.objects.filter(placement_id=placement_id).exclude(
            state=EscalationState.CLOSED
        )
        count = open_rows.count()
        if count == 0:
            return None
        highest = (
            open_rows.filter(severity="high").exists() and "high"
            or open_rows.filter(severity="medium").exists() and "medium"
            or "low"
        )
        # Counts and severity only — never content (POL-019, INV-13).
        return BlockReason(
            code="OpenEscalationBlocksCompletion",
            detail={"escalation_count": count, "highest_severity": highest},
        )
