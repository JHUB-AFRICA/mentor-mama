"""Read queries. Scope filtering happens here, not in the view (SEC-02)."""

from __future__ import annotations

from django.db.models import Q

from apps.facilities import api as facilities
from apps.core.models import AuditEntry
from apps.identity import api as identity
from apps.institutions import api as institutions
from apps.placements.models import Placement


def in_scope(scope):
    """Every scoped query filters here.

    An endpoint that forgets its filter must return nothing, not everything — so
    the fallthrough is an empty queryset, never `.all()`.
    """
    qs = Placement.objects.select_related("cohort")
    if scope.is_program_admin:
        return qs.filter(institution__program_id=scope.program_id)
    if scope.role == "student":
        return qs.filter(
            institution__program_id=scope.program_id,
            student_assignments__student_id=scope.user_id,
            student_assignments__ended_at=None,
        ).distinct()
    if scope.role == "mentor":
        return qs.filter(
            facility__program_id=scope.program_id,
            mentor_assignments__mentor_id=scope.user_id,
            mentor_assignments__ended_at=None,
        ).distinct()
    if scope.institution_id:
        return qs.filter(institution_id=scope.institution_id)
    if scope.facility_id:
        return qs.filter(facility_id=scope.facility_id)
    return qs.none()


def page(scope, *, page_number: int = 1, page_size: int = 12, search: str = "", state: str = "", cohort_id: str = "", institution_id: str = "", facility_id: str = "", ward_id: str = "", mentor_id: str = ""):
    queryset = in_scope(scope).select_related("cohort", "cohort__institution", "facility")
    if search:
        queryset = queryset.filter(
            Q(cohort__name__icontains=search)
            | Q(facility__name__icontains=search)
            | Q(student_assignments__ended_at=None, student_assignments__student__first_name__icontains=search)
            | Q(student_assignments__ended_at=None, student_assignments__student__last_name__icontains=search)
            | Q(student_assignments__ended_at=None, student_assignments__student__email__icontains=search)
            | Q(student_assignments__ended_at=None, student_assignments__student__registration_number__icontains=search)
            | Q(mentor_assignments__ended_at=None, mentor_assignments__mentor__email__icontains=search)
            | Q(mentor_assignments__ended_at=None, mentor_assignments__mentor__first_name__icontains=search)
            | Q(mentor_assignments__ended_at=None, mentor_assignments__mentor__last_name__icontains=search)
        ).distinct()
    if state:
        queryset = queryset.filter(state=state)
    if cohort_id:
        queryset = queryset.filter(cohort_id=cohort_id)
    if institution_id:
        queryset = queryset.filter(institution_id=institution_id)
    if facility_id:
        queryset = queryset.filter(facility_id=facility_id)
    if ward_id:
        queryset = queryset.filter(ward_assignments__ward_id=ward_id, ward_assignments__ended_at=None)
    if mentor_id:
        queryset = queryset.filter(mentor_assignments__mentor_id=mentor_id, mentor_assignments__ended_at=None)
    queryset = queryset.order_by("-created_at")
    total = queryset.count()
    page_size = min(max(page_size, 1), 50)
    start = (max(page_number, 1) - 1) * page_size
    return queryset[start:start + page_size], total, page_size


def options(scope):
    cohorts = institutions.scoped_cohorts(
        program_id=scope.program_id,
        institution_id=None if scope.is_program_admin else scope.institution_id,
    )
    wards = facilities.scoped_wards(
        program_id=scope.program_id,
        facility_id=None if scope.is_program_admin else scope.facility_id,
    )
    mentors = identity.active_mentors(
        program_id=scope.program_id,
        facility_id=None if scope.is_program_admin else scope.facility_id,
    )
    return cohorts, wards, mentors


def activity(scope, placement_id):
    """Return only audit events for an already scope-checked placement."""
    placement = in_scope(scope).filter(id=placement_id).first()
    if placement is None:
        return None
    return AuditEntry.objects.filter(
        entity_table="placements_placement", entity_id=placement_id,
        scope__program_id=str(scope.program_id),
    ).select_related("actor").order_by("-occurred_at")[:50]
