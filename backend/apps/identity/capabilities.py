"""The server-owned capability matrix (FE-04).

Clients receive this map from ``GET /me`` for presentation only.  Command
services call the same functions, so hiding a button is never an authority
boundary.
"""

from __future__ import annotations

from apps.core import errors
from apps.identity.models import Role, Status


CAPABILITY_ROLES: dict[str, frozenset[str]] = {
    "create_placement": frozenset({Role.COORDINATOR, Role.PROGRAM_ADMIN}),
    "release_placement": frozenset({Role.COORDINATOR, Role.PROGRAM_ADMIN}),
    "allocate_ward": frozenset({Role.NURSE_MANAGER, Role.PROGRAM_ADMIN}),
    "arrange_placements": frozenset({Role.NURSE_MANAGER, Role.PROGRAM_ADMIN}),
    "override_arrangement": frozenset({Role.COORDINATOR, Role.PROGRAM_ADMIN}),
    "download_allocation_list": frozenset({Role.COORDINATOR, Role.NURSE_MANAGER, Role.PROGRAM_ADMIN}),
    "request_facility": frozenset({Role.COORDINATOR, Role.PROGRAM_ADMIN}),
    "assign_mentor": frozenset({Role.NURSE_MANAGER, Role.PROGRAM_ADMIN}),
    "pause_placement": frozenset({Role.NURSE_MANAGER, Role.COORDINATOR, Role.PROGRAM_ADMIN}),
    "resume_placement": frozenset({Role.NURSE_MANAGER, Role.COORDINATOR, Role.PROGRAM_ADMIN}),
    "complete_placement": frozenset({Role.NURSE_MANAGER, Role.PROGRAM_ADMIN}),
    "archive_placement": frozenset({Role.PROGRAM_ADMIN}),
    "withdraw_placement": frozenset({Role.NURSE_MANAGER, Role.COORDINATOR, Role.PROGRAM_ADMIN}),
    "log_session": frozenset({Role.MENTOR}),
    # Lifecycle capabilities are server-enforced even though the pilot UI does
    # not yet expose all of these actions.
    "confirm_placement": frozenset({Role.STUDENT}),
    "submit_assessment": frozenset({Role.STUDENT}),
    "submit_feedback": frozenset({Role.STUDENT}),
    "open_induction": frozenset({Role.MENTOR, Role.NURSE_MANAGER}),
    "activate_placement": frozenset({Role.MENTOR}),
    "review_escalation": frozenset({Role.NURSE_MANAGER, Role.COORDINATOR, Role.PROGRAM_ADMIN}),
    "review_feedback": frozenset({Role.NURSE_MANAGER, Role.COORDINATOR}),
    "export_reports": frozenset({Role.NURSE_MANAGER, Role.COORDINATOR, Role.PROGRAM_ADMIN}),
    "manage_content": frozenset({Role.PROGRAM_ADMIN}),
}

ROLE_LABELS = {
    Role.STUDENT: "Student",
    Role.MENTOR: "Clinical Mentor",
    Role.NURSE_MANAGER: "Nurse Manager",
    Role.COORDINATOR: "University Coordinator",
    Role.PROGRAM_ADMIN: "Programme Administrator",
}


def policy_summary() -> list[dict]:
    """Expose the server-owned access matrix for administrator review only."""
    return [
        {
            "role": role,
            "label": ROLE_LABELS[role],
            "mfa_required": role in {Role.PROGRAM_ADMIN, Role.COORDINATOR, Role.NURSE_MANAGER},
            "scope": "programme" if role == Role.PROGRAM_ADMIN else "institution" if role in {Role.STUDENT, Role.COORDINATOR} else "facility",
            "capabilities": sorted(capability for capability, roles in CAPABILITY_ROLES.items() if role in roles),
        }
        for role in Role
    ]


def capabilities_for(user) -> dict[str, bool]:
    return {capability: user.status == Status.ACTIVE and user.role in roles
            for capability, roles in CAPABILITY_ROLES.items()}


def require(user, capability: str) -> None:
    if not capabilities_for(user).get(capability, False):
        # A capability miss deliberately has the same public shape as a scope
        # miss.  It must not disclose whether the protected record exists.
        raise errors.UnauthorizedFacilityAccess()


def require_scope(user, *, institution_id=None, facility_id=None) -> None:
    """Verify a command actor can operate on the aggregate's derived scope."""
    if user.status != Status.ACTIVE:
        raise errors.UnauthorizedFacilityAccess()
    if user.role == Role.PROGRAM_ADMIN:
        return
    if user.institution_id and user.institution_id == institution_id:
        return
    if user.facility_id and user.facility_id == facility_id:
        return
    raise errors.UnauthorizedFacilityAccess()
