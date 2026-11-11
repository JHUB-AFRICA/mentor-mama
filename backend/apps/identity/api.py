"""Public surface of identity (MA-11)."""

from __future__ import annotations

from uuid import UUID

from django.db import transaction
from django.db.models import Count, Q

from apps.identity import capabilities
from apps.identity.models import Program, Role, Status, User
from apps.core import audit
from apps.identity.scope import Scope, resolve as resolve_scope  # noqa: F401

__all__ = ["Scope", "resolve_scope", "is_active", "role_of", "facility_id_of", "user_of", "users",
           "ROLES", "STATUSES", "capabilities_for", "require_capability", "require_scope",
           "active_mentors", "invitation_token", "password_reset_token",
           "mentor_assignment_policy",
           "register_scope_validator", "valid_scope", "invalidate_directory_coverage"]

ROLES = Role
STATUSES = Status

_scope_validators = {
    "institution": None,
    "facility": None,
}


def is_active(user_id: UUID) -> bool:
    return User.objects.filter(id=user_id, status=Status.ACTIVE).exists()


def user_of(user_id: UUID) -> User | None:
    """Return an identity-owned user projection for platform consumers."""
    return User.objects.filter(id=user_id).first()


def users(**filters):
    """Return a read-only identity projection using identity-owned filters."""
    return User.objects.filter(**filters)


def register_scope_validator(scope: str, validator) -> None:
    """Register an owning-module scope check without an upward identity import."""
    if scope not in _scope_validators:
        raise ValueError(f"Unknown identity scope: {scope}")
    _scope_validators[scope] = validator


def valid_scope(*, scope: str, scope_id: UUID, program_id: UUID) -> bool:
    validator = _scope_validators.get(scope)
    if not validator:
        return False
    scope_field = {"institution": "institution_id", "facility": "facility_id"}[scope]
    return bool(validator(**{scope_field: scope_id, "program_id": program_id}))


@transaction.atomic
def invalidate_directory_coverage(*, actor, program_id: UUID) -> None:
    """Clear the human pilot-coverage attestation after a directory mutation."""
    programme = Program.objects.select_for_update().filter(id=program_id).first()
    if programme is None or programme.directory_reviewed_at is None:
        return
    programme.directory_reviewed_at = None
    programme.directory_reviewed_by = None
    programme.save(update_fields=["directory_reviewed_at", "directory_reviewed_by", "updated_at"])
    audit.record(
        actor=actor, action="programme.directory_coverage_invalidated",
        entity_table="identity_program", entity_id=programme.id,
        scope={"program_id": str(programme.id)},
        changes={"reason": "directory_changed"},
    )


def role_of(user_id: UUID) -> str | None:
    return User.objects.filter(id=user_id).values_list("role", flat=True).first()


def facility_id_of(user_id: UUID) -> UUID | None:
    return User.objects.filter(id=user_id).values_list("facility_id", flat=True).first()


def capabilities_for(user) -> dict[str, bool]:
    return capabilities.capabilities_for(user)


def require_capability(user, capability: str) -> None:
    capabilities.require(user, capability)


def require_scope(user, *, institution_id=None, facility_id=None) -> None:
    capabilities.require_scope(user, institution_id=institution_id, facility_id=facility_id)


# A mentor's workload is the placements still open, not every assignment ever made.
_CLOSED_PLACEMENT_STATES = ("completed", "archived", "withdrawn")
_OPEN_ASSIGNMENT = Q(mentor_assignments__ended_at=None) & ~Q(mentor_assignments__placement__state__in=_CLOSED_PLACEMENT_STATES)


def active_mentors(*, program_id: UUID, facility_id: UUID | None = None):
    """Read-only mentor projection for placement assignment screens."""
    queryset = User.objects.filter(program_id=program_id, role=Role.MENTOR, status=Status.ACTIVE).annotate(
        active_placement_count=Count("mentor_assignments__placement", filter=_OPEN_ASSIGNMENT),
    )
    if facility_id is not None:
        queryset = queryset.filter(facility_id=facility_id)
    return queryset.order_by("first_name", "last_name", "email")


def mentor_assignment_policy(*, mentor_id: UUID, facility_id: UUID) -> dict:
    """Return the identity-owned allocation policy for a facility mentor."""
    mentor = User.objects.filter(
        id=mentor_id, program_id__isnull=False, facility_id=facility_id, role=Role.MENTOR,
    ).annotate(
        active_assignment_count=Count(
            "mentor_assignments",
            filter=_OPEN_ASSIGNMENT,
        )
    ).first()
    if mentor is None:
        return {"available": False, "reason": "Mentor is not assigned to this facility."}
    if mentor.status != Status.ACTIVE:
        return {"available": False, "reason": "Mentor account is not active."}
    if not mentor.accepting_students:
        return {"available": False, "reason": "Mentor is not accepting new students."}
    if mentor.active_assignment_count >= mentor.max_active_placements:
        return {"available": False, "reason": "Mentor has reached their workload limit."}
    return {"available": True}


def invitation_token(user) -> str:
    """Return the signed invitation token without exposing authentication internals."""
    from apps.identity import authentication

    return authentication.invitation_token(user)


def password_reset_token(user) -> str:
    """Return the signed password-reset token through the identity boundary."""
    from apps.identity import authentication

    return authentication.password_reset_tokens.make_token(user)
