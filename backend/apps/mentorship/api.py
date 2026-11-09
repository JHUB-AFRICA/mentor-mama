"""Public surface of mentorship (MA-11)."""

from __future__ import annotations

from uuid import UUID

from datetime import timedelta

from django.utils import timezone

from apps.mentorship.models import Session


def session_count(placement_id: UUID) -> int:
    return Session.objects.filter(placement_id=placement_id).count()


def progress(placement_id: UUID) -> dict:
    """Return session metadata only; session free text stays in mentorship."""
    sessions = Session.objects.filter(placement_id=placement_id)
    latest = sessions.order_by("-session_date").values_list("session_date", flat=True).first()
    return {
        "sessions_logged": sessions.count(),
        "last_session_date": latest.isoformat() if latest else None,
    }


def dashboard_counts(actor) -> dict[str, int]:
    rows = Session.objects.filter(placement__cohort__institution__program_id=actor.program_id)
    if actor.role == "mentor":
        rows = rows.filter(mentor_assignment__mentor_id=actor.id)
    elif actor.role == "student":
        rows = rows.filter(placement__student_assignments__student_id=actor.id, placement__student_assignments__ended_at=None)
    elif actor.role not in {"program_admin", "coordinator", "nurse_manager"}:
        rows = rows.none()
    today = timezone.localdate()
    return {
        "sessions_total": rows.count(),
        "sessions_this_week": rows.filter(session_date__gte=today - timedelta(days=today.weekday())).count(),
    }
