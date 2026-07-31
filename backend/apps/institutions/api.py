"""Public surface of institutions (MA-11)."""

from __future__ import annotations

from uuid import UUID

from apps.institutions.models import Cohort, CohortMembership


def institution_id_of_cohort(cohort_id: UUID) -> UUID | None:
    """Derived value for POL-006 — the source of truth for a placement's institution."""
    return Cohort.objects.filter(id=cohort_id).values_list("institution_id", flat=True).first()


def is_enrolled(cohort_id: UUID, student_id: UUID) -> bool:
    return CohortMembership.objects.filter(cohort_id=cohort_id, student_id=student_id).exists()
