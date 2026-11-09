from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class ModuleCompleted:
    module_id: UUID
    user_id: UUID
