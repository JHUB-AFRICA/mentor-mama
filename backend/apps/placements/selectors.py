"""Read queries. Scope filtering happens here, not in the view (SEC-02)."""

from __future__ import annotations

from apps.placements.models import Placement


def in_scope(scope):
    """Every scoped query filters here.

    An endpoint that forgets its filter must return nothing, not everything — so
    the fallthrough is an empty queryset, never `.all()`.
    """
    qs = Placement.objects.select_related("cohort")
    if scope.is_program_admin:
        return qs.filter(institution__program_id=scope.program_id)
    if scope.institution_id:
        return qs.filter(institution_id=scope.institution_id)
    if scope.facility_id:
        return qs.filter(facility_id=scope.facility_id)
    return qs.none()
