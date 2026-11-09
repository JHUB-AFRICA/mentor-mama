from django.db import transaction

from apps.core import audit
from apps.identity.models import Role, Status
from apps.identity import api as identity
from apps.facilities.models import Facility


def _allowed(actor) -> bool:
    return actor.status == Status.ACTIVE and actor.role == Role.PROGRAM_ADMIN


def _can_read(actor) -> bool:
    """Allow facility operators to read only the facility they operate."""
    return (
        actor.status == Status.ACTIVE
        and actor.role in {Role.PROGRAM_ADMIN, Role.NURSE_MANAGER}
        and (actor.role == Role.PROGRAM_ADMIN or actor.facility_id is not None)
    )


def list_facilities(*, actor):
    if not _can_read(actor):
        return None
    queryset = Facility.objects.filter(program_id=actor.program_id)
    if actor.role == Role.NURSE_MANAGER:
        queryset = queryset.filter(id=actor.facility_id)
    return queryset.order_by("name")


@transaction.atomic
def update_facility(*, actor, facility_id, **data):
    if not _allowed(actor):
        return None
    facility = Facility.objects.select_for_update().filter(id=facility_id, program_id=actor.program_id).first()
    if facility is None:
        return None
    previous_logo = facility.logo
    archived = data.pop("archived", None)
    if data.pop("clear_logo", False) and "logo" not in data:
        data["logo"] = None
    changed_fields = list(data)
    for field, value in data.items():
        setattr(facility, field, value)
    if archived is not None:
        from django.utils import timezone
        facility.archived_at = timezone.now() if archived else None
    facility.save(update_fields=[*data.keys(), "archived_at", "updated_at"])
    if previous_logo and previous_logo.name != facility.logo.name:
        transaction.on_commit(lambda: previous_logo.delete(save=False))
    audit.record(actor=actor, action="facility.updated", entity_table="facilities_facility", entity_id=facility.id, scope={"program_id": str(actor.program_id)}, changes={"fields": changed_fields, "logo_updated": "logo" in data, **({"archived": archived} if archived is not None else {})})
    identity.invalidate_directory_coverage(actor=actor, program_id=actor.program_id)
    return facility


@transaction.atomic
def create_facility(*, actor, **data):
    if not _allowed(actor):
        return None
    facility = Facility.objects.create(program_id=actor.program_id, **data)
    audit.record(actor=actor, action="facility.created", entity_table="facilities_facility", entity_id=facility.id, scope={"program_id": str(actor.program_id)}, changes={"name": facility.name})
    identity.invalidate_directory_coverage(actor=actor, program_id=actor.program_id)
    return facility
