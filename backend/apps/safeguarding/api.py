"""Public surface of safeguarding (MA-11)."""

from __future__ import annotations

from uuid import UUID

from apps.safeguarding.models import Escalation, EscalationState, Severity


def open_count(placement_id: UUID) -> int:
    """Counts only. Content never crosses this boundary (INV-13)."""
    return Escalation.objects.filter(placement_id=placement_id).exclude(
        state=EscalationState.CLOSED
    ).count()


def open_severity_counts(placement_id: UUID) -> dict[str, int]:
    rows = Escalation.objects.filter(placement_id=placement_id).exclude(state=EscalationState.CLOSED)
    return {severity: rows.filter(severity=severity).count() for severity, _ in Severity.choices}


def dashboard_counts(actor) -> dict[str, int]:
    """Return counts and severity only; restricted concern text never crosses."""
    rows = Escalation.objects.filter(facility__program_id=actor.program_id)
    if actor.role == "nurse_manager":
        rows = rows.filter(facility_id=actor.facility_id)
    elif actor.role == "coordinator":
        rows = rows.filter(placement__institution_id=actor.institution_id)
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
