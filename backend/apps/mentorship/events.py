from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class SessionLogged:
    placement_id: UUID
    session_id: UUID
    mentor_id: UUID
