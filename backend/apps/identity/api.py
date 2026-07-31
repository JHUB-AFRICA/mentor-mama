"""Public surface of identity (MA-11)."""

from __future__ import annotations

from uuid import UUID

from apps.identity.models import Role, Status, User
from apps.identity.scope import Scope, resolve as resolve_scope  # noqa: F401

__all__ = ["Scope", "resolve_scope", "is_active", "role_of", "facility_id_of", "ROLES"]

ROLES = Role


def is_active(user_id: UUID) -> bool:
    return User.objects.filter(id=user_id, status=Status.ACTIVE).exists()


def role_of(user_id: UUID) -> str | None:
    return User.objects.filter(id=user_id).values_list("role", flat=True).first()


def facility_id_of(user_id: UUID) -> UUID | None:
    return User.objects.filter(id=user_id).values_list("facility_id", flat=True).first()
