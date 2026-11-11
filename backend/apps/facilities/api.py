"""Public surface of facilities (MA-11)."""

from __future__ import annotations

from uuid import UUID

from django.db import transaction

from apps.core import audit
from apps.identity import api as identity
from apps.facilities.models import Facility, Ward


def facility_belongs_to_program(*, facility_id: UUID, program_id: UUID) -> bool:
    """Validate a scope id at the facility module boundary."""
    return Facility.objects.filter(
        id=facility_id,
        program_id=program_id,
        archived_at=None,
    ).exists()


def active_directory_counts(*, program_id: UUID) -> tuple[int, int]:
    facilities = Facility.objects.filter(program_id=program_id, archived_at=None)
    facility_count = facilities.count()
    ward_count = Ward.objects.filter(facility__program_id=program_id, facility__archived_at=None, archived_at=None).count()
    return facility_count, ward_count


def facility_id_of_ward(ward_id: UUID) -> UUID | None:
    """Derived value for POL-006 — the source of truth for a placement's facility."""
    return Ward.objects.filter(id=ward_id).values_list("facility_id", flat=True).first()


def lock_ward(ward_id: UUID) -> Ward | None:
    """Row-lock a ward for capacity admission (INV-16, DB-03, WFR-029)."""
    return Ward.objects.select_for_update().filter(id=ward_id).first()


def scoped_wards(*, program_id: UUID, facility_id: UUID | None = None):
    queryset = Ward.objects.filter(
        facility__program_id=program_id, archived_at=None, facility__archived_at=None,
    ).select_related("facility").order_by("facility__name", "name")
    if facility_id is not None:
        queryset = queryset.filter(facility_id=facility_id)
    return queryset


def ward_directory(*, program_id: UUID, facility_id: UUID | None = None):
    """Return all directory wards, including archived rows for restore flows."""
    queryset = Ward.objects.filter(facility__program_id=program_id).select_related("facility")
    if facility_id is not None:
        queryset = queryset.filter(facility_id=facility_id)
    return queryset.order_by("facility__name", "name")


def ward_of_id(ward_id: UUID, *, program_id: UUID) -> Ward | None:
    return Ward.objects.filter(id=ward_id, facility__program_id=program_id).select_related("facility").first()


@transaction.atomic
def create_ward_record(*, actor, facility_id: UUID, name: str, max_students: int, shift_pattern: str = "") -> Ward | None:
    """Create a ward record: a Programme Admin anywhere in the programme, a Nurse Manager in their own facility."""
    if actor.status != "active" or actor.role not in {"program_admin", "nurse_manager"}:
        return None
    if actor.role == "nurse_manager" and actor.facility_id != facility_id:
        return None
    facility = Facility.objects.filter(
        id=facility_id, program_id=actor.program_id, archived_at=None,
    ).first()
    if facility is None:
        return None
    ward = Ward.objects.create(
        facility=facility, name=name, max_students=max_students,
        shift_pattern=shift_pattern,
    )
    audit.record(
        actor=actor, action="ward.created", entity_table="facilities_ward",
        entity_id=ward.id,
        scope={"program_id": str(actor.program_id), "facility_id": str(facility.id)},
        changes={"name": ward.name, "max_students": ward.max_students},
    )
    if actor.role == "program_admin":
        identity.invalidate_directory_coverage(actor=actor, program_id=actor.program_id)
    return ward
