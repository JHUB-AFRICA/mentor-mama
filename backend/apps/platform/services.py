"""Platform-level commands: programmes and their first administrators.

Account status, sessions, invitations and support decisions reuse the identity services, which already
know the platform role. Everything here requires an active platform administrator.
"""

from __future__ import annotations

from django.db import transaction
from django.utils.text import slugify

from apps.core import audit
from apps.core.errors import UnauthorizedFacilityAccess
from apps.identity import authentication
from apps.identity.models import Program, Role


def require_platform_admin(actor) -> None:
    if not authentication.is_platform_admin(actor):
        raise UnauthorizedFacilityAccess()


@transaction.atomic
def create_programme(*, actor, name: str, short_name: str = "", academic_year: str = "", description: str = "",
                     admin: dict | None = None) -> tuple[Program, object | None]:
    """Create a programme (with the default induction checklist) and optionally invite its first administrator."""
    require_platform_admin(actor)
    name = " ".join(name.split())
    if not name:
        raise ValueError("A programme needs a name.")
    if Program.objects.filter(name__iexact=name).exists():
        raise ValueError("A programme with this name already exists.")
    programme = Program.objects.create(
        name=name[:120], short_name=(short_name or "").strip()[:40] or slugify(name)[:40].upper(),
        academic_year=(academic_year or "").strip()[:20], description=(description or "").strip(),
    )
    from apps.induction.services import ensure_default_template

    ensure_default_template(programme)
    audit.record(actor=actor, action="platform.programme_created", entity_table="identity_program",
                 entity_id=programme.id, scope={"platform": True, "program_id": str(programme.id)},
                 changes={"name": programme.name})
    invited = invite_programme_admin(actor=actor, programme=programme, **admin) if admin else None
    return programme, invited


def invite_programme_admin(*, actor, programme: Program, email: str, first_name: str, last_name: str, phone: str = ""):
    require_platform_admin(actor)
    return authentication.invite_user(
        actor=actor, email=email, first_name=first_name.strip(), last_name=last_name.strip(),
        role=Role.PROGRAM_ADMIN, program_id=programme.id, phone=phone.strip(),
    )


def invite_platform_admin(*, actor, email: str, first_name: str, last_name: str, phone: str = ""):
    require_platform_admin(actor)
    return authentication.invite_user(
        actor=actor, email=email, first_name=first_name.strip(), last_name=last_name.strip(),
        role=Role.PLATFORM_ADMIN, program_id=None, phone=phone.strip(),
    )
