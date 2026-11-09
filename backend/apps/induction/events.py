from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class InductionOpened:
    placement_id: UUID
    checklist_id: UUID


@dataclass(frozen=True)
class OrientationAcknowledged:
    placement_id: UUID
    acknowledgement_id: UUID
    recipient_user_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class ChecklistItemCompleted:
    checklist_id: UUID
    template_item_id: UUID


@dataclass(frozen=True)
class InductionCompleted:
    placement_id: UUID
    checklist_id: UUID
    recipient_user_ids: tuple[UUID, ...] = ()
