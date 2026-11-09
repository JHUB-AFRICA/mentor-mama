"""Public surface of institutions (MA-11)."""

from __future__ import annotations

from uuid import UUID

from apps.identity import api as identity
from apps.institutions.models import Cohort, CohortMembership, Institution


def institution_belongs_to_program(*, institution_id: UUID, program_id: UUID) -> bool:
    """Validate a scope id at the institution module boundary."""
    return Institution.objects.filter(
        id=institution_id,
        program_id=program_id,
        archived_at=None,
        is_active=True,
    ).exists()


def active_institution_count(*, program_id: UUID) -> int:
    return Institution.objects.filter(program_id=program_id, archived_at=None, is_active=True).count()


def institution_id_of_cohort(cohort_id: UUID) -> UUID | None:
    """Derived value for POL-006 — the source of truth for a placement's institution."""
    return Cohort.objects.filter(id=cohort_id).values_list("institution_id", flat=True).first()


def is_enrolled(cohort_id: UUID, student_id: UUID) -> bool:
    return CohortMembership.objects.filter(cohort_id=cohort_id, student_id=student_id, removed_at__isnull=True).exists()


def scoped_cohorts(*, program_id: UUID, institution_id: UUID | None = None):
    queryset = Cohort.objects.filter(
        institution__program_id=program_id, archived_at=None, institution__archived_at=None,
    ).select_related("institution").order_by("-start_date", "name")
    if institution_id is not None:
        queryset = queryset.filter(institution_id=institution_id)
    return queryset


def cohort_students(*, cohort_id: UUID, program_id: UUID, institution_id: UUID | None = None):
    queryset = identity.users(
        program_id=program_id, role=identity.ROLES.STUDENT,
        status__in=[identity.STATUSES.INVITED, identity.STATUSES.ACTIVE, identity.STATUSES.SUSPENDED],
        cohort_memberships__cohort_id=cohort_id,
        cohort_memberships__removed_at__isnull=True,
    )
    if institution_id is not None:
        queryset = queryset.filter(institution_id=institution_id)
    return queryset.order_by("first_name", "last_name", "email")
