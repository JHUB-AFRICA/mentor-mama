"""Public surface of safeguarding (MA-11)."""

from __future__ import annotations

from uuid import UUID

from apps.safeguarding.models import Escalation, EscalationState, ReviewRoute, Severity

_ROUTES_FOR_ROLE = {
    "nurse_manager": (ReviewRoute.NURSE_MANAGER, ReviewRoute.BOTH),
    "coordinator": (ReviewRoute.COORDINATOR, ReviewRoute.BOTH),
}


def _visible_to(rows, viewer):
    """A concern exists, even as a number, only for the people allowed to know about it.

    The submitter chose who reviews it; anyone else (including a mentor who may be its subject) never sees it counted.
    `viewer=None` is the internal/system view used by lifecycle blockers.
    """
    if viewer is None or viewer.role == "program_admin":
        return rows
    if viewer.role in _ROUTES_FOR_ROLE:
        return rows.filter(routed_to__in=_ROUTES_FOR_ROLE[viewer.role])
    return rows.filter(submitted_by_id=viewer.id)


def open_count(placement_id: UUID, viewer=None) -> int:
    """Counts only. Content never crosses this boundary (INV-13)."""
    return _visible_to(Escalation.objects.filter(placement_id=placement_id), viewer).exclude(
        state=EscalationState.CLOSED
    ).count()


def open_severity_counts(placement_id: UUID, viewer=None) -> dict[str, int]:
    rows = _visible_to(Escalation.objects.filter(placement_id=placement_id), viewer).exclude(state=EscalationState.CLOSED)
    return {severity: rows.filter(severity=severity).count() for severity, _ in Severity.choices}


def dashboard_counts(actor) -> dict[str, int]:
    """Return counts and severity only; restricted concern text never crosses."""
    rows = Escalation.objects.filter(facility__program_id=actor.program_id)
    if actor.role == "nurse_manager":
        rows = _visible_to(rows.filter(facility_id=actor.facility_id), actor)
    elif actor.role == "coordinator":
        rows = _visible_to(rows.filter(placement__institution_id=actor.institution_id), actor)
    elif actor.role in {"student", "mentor"}:
        rows = rows.filter(submitted_by_id=actor.id)
    elif actor.role != "program_admin":
        rows = rows.none()
    open_rows = rows.exclude(state=EscalationState.CLOSED)
    return {
        "open_concerns": open_rows.count(),
        "high_concerns": open_rows.filter(severity=Severity.HIGH).count(),
        "medium_concerns": open_rows.filter(severity=Severity.MEDIUM).count(),
        "low_concerns": open_rows.filter(severity=Severity.LOW).count(),
    }
