"""Public surface of mentorship (MA-11)."""

from __future__ import annotations

from uuid import UUID

from datetime import timedelta

from django.utils import timezone

from apps.mentorship.models import Session
from apps.mentorship.reminders import ReminderTooSoon  # noqa: F401  (re-exported for analytics)


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


def follow_up_counts(actor) -> dict[str, int]:
    """Pending / overdue / student-support follow-ups the actor may act on (no session text)."""
    from apps.mentorship import followups

    return followups.counts(actor)


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


def last_reminded(mentor_ids) -> dict:
    """Latest reminder time per mentor id (inactive-mentors list and rate limit)."""
    from apps.mentorship import reminders

    return reminders.last_reminded(mentor_ids)


def send_reminder(*, actor, mentor_id, reason_codes, live_students: int, days_since_last_session):
    """Send one supportive reminder (at most one per mentor per three days).  The caller must already
    have established that the actor may remind this mentor."""
    from apps.mentorship import reminders

    return reminders.send(
        actor=actor, mentor_id=mentor_id, reason_codes=reason_codes, live_students=live_students,
        days_since_last_session=days_since_last_session,
    )


def reminder_next_allowed(last):
    from apps.mentorship import reminders

    return reminders.next_allowed(last)
