from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class EscalationRaised:
    escalation_id: UUID
    placement_id: UUID | None
    severity: str
    recipient_user_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class EscalationStatusChanged:
    escalation_id: UUID
    state: str
    recipient_user_ids: tuple[UUID, ...] = ()
