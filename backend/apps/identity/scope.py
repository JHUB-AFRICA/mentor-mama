"""Scope resolution — the single implementation (AUTH-001, SEC-01).

Resolved server-side from the authenticated user on every request. A scope value
present in a request body or query string is ignored.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID


@dataclass(frozen=True)
class Scope:
    user_id: UUID
    role: str
    program_id: UUID
    institution_id: UUID | None = None
    facility_id: UUID | None = None
    ward_ids: tuple[UUID, ...] = field(default_factory=tuple)

    @property
    def is_program_admin(self) -> bool:
        return self.role == "program_admin"

    def as_dict(self) -> dict:
        return {
            "user_id": str(self.user_id),
            "role": self.role,
            "program_id": str(self.program_id),
            "institution_id": str(self.institution_id) if self.institution_id else None,
            "facility_id": str(self.facility_id) if self.facility_id else None,
        }


def resolve(user) -> Scope:
    return Scope(
        user_id=user.id,
        role=user.role,
        program_id=user.program_id,
        institution_id=user.institution_id,
        facility_id=user.facility_id,
    )
