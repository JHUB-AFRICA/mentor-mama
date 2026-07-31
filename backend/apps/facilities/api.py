"""Public surface of facilities (MA-11)."""

from __future__ import annotations

from uuid import UUID

from apps.facilities.models import Ward


def facility_id_of_ward(ward_id: UUID) -> UUID | None:
    """Derived value for POL-006 — the source of truth for a placement's facility."""
    return Ward.objects.filter(id=ward_id).values_list("facility_id", flat=True).first()


def lock_ward(ward_id: UUID) -> Ward | None:
    """Row-lock a ward for capacity admission (INV-16, DB-03, WFR-029)."""
    return Ward.objects.select_for_update().filter(id=ward_id).first()
