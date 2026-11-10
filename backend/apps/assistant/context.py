"""The user's own live situation, summarised for Menta.

Read-only, role-scoped through each module's public API, and deliberately free
of names, emails, phone numbers, registration numbers, notes and concern text:
this text is sent to the AI provider. Counts and stages only, plus the
student's own facility/ward/cohort names and dates.
"""

from __future__ import annotations

import logging

from django.utils import timezone

from apps.assessments import api as assessments
from apps.identity.scope import resolve
from apps.induction import api as induction
from apps.learning import api as learning
from apps.mentorship import api as mentorship
from apps.placements import api as placements
from apps.safeguarding import api as safeguarding

logger = logging.getLogger(__name__)

_STATE_ORDER = (
    ("draft", "Draft"), ("scheduled", "Scheduled"), ("awaiting_student", "Awaiting student"),
    ("orientation", "Orientation"), ("induction", "Induction"), ("active", "Active"),
    ("paused", "Paused"), ("completed", "Completed"), ("archived", "Archived"), ("withdrawn", "Withdrawn"),
)


def _student_next_step(summary: dict) -> str:
    state, placement_id = summary["state"], summary["id"]
    today = timezone.localdate()
    if state in ("draft", "scheduled"):
        return "Nothing for you yet: your coordinator and the facility are still setting this placement up."
    if state == "awaiting_student":
        return "Review and sign your placement acknowledgement: My placements, open the placement, then sign by typing your account name."
    if state == "orientation":
        if induction.orientation_acknowledged(placement_id):
            return "Orientation done. Your mentor will complete induction with you at the ward."
        return 'Complete orientation: open the placement, Journey tab, "Open orientation guide", then "Acknowledge orientation".'
    if state == "induction":
        progress = induction.progress(placement_id)
        done = f" ({progress['completed']} of {progress['total']} required items done)" if progress["available"] else ""
        return f"Your mentor is completing induction with you{done}. It becomes Active when they sign it."
    if state in ("active", "paused"):
        if assessments.progress(placement_id)["final_submitted"]:
            return "Your final assessment is submitted."
        if today > summary["end"]:
            return 'Your final assessment is due: open the placement, Journey tab, "Complete your final assessment".'
        if state == "paused":
            return "The placement is paused; the end date moves with the pause. Your mentor or nurse manager resumes it."
        return f"Attend sessions with your mentor. The final assessment opens after {summary['end']:%d %b %Y}."
    if state == "completed":
        return "This placement is complete."
    return "No action needed on this placement."


def _student(user) -> list[str]:
    rows = placements.student_placement_summaries(user.id)
    if not rows:
        return ["You have no placements yet. Your university coordinator creates and releases them."]
    lines = []
    for row in rows:
        where = ", ".join(part for part in (row["facility"], row["ward"]) if part) or "facility to be confirmed"
        mentor = "" if row["has_mentor"] else " No mentor assigned yet."
        sessions = mentorship.progress(row["id"])["sessions_logged"]
        lines.append(
            f"- Placement ({row['cohort']}) at {where}, {row['start']:%d %b %Y} to {row['end']:%d %b %Y}: "
            f"stage {row['state_label']}. {sessions} session(s) logged.{mentor}\n"
            f"  Next step: {_student_next_step(row)}"
        )
    return ["Your placements:", *lines]


def _placement_counts(user) -> str:
    counts = placements.dashboard_counts(resolve(user))
    parts = [f"{label} {counts[f'placements_{key}']}" for key, label in _STATE_ORDER if counts.get(f"placements_{key}")]
    total = counts.get("placements_total", 0)
    return f"{total} placement(s) in your scope" + (f": {', '.join(parts)}." if parts else ".")


def _staff(user) -> list[str]:
    lines = [_placement_counts(user)]
    sessions = mentorship.dashboard_counts(user)
    lines.append(f"Mentorship sessions logged: {sessions['sessions_total']} in total, {sessions['sessions_this_week']} this week.")
    if user.role in ("program_admin", "coordinator", "nurse_manager"):
        concerns = safeguarding.dashboard_counts(user)
        if concerns["open_concerns"]:
            lines.append(
                f"Open safeguarding concerns: {concerns['open_concerns']} "
                f"(high {concerns['high_concerns']}, medium {concerns['medium_concerns']}, low {concerns['low_concerns']})."
            )
        else:
            lines.append("No open safeguarding concerns.")
    if user.role == "mentor":
        counts = placements.dashboard_counts(resolve(user))
        waiting = counts.get("placements_orientation", 0) + counts.get("placements_induction", 0)
        if waiting:
            lines.append(f"{waiting} of your student(s) are in Orientation or Induction and may need induction from you.")
        progress = learning.progress(user)
        if progress["available"]:
            lines.append(
                f"Your training: {progress['completed']} of {progress['total']} modules complete, "
                f"{progress['required_completed']} of {progress['required_total']} required."
            )
    return lines


def situation(user) -> str:
    """Plain-text summary of this user's own current state, safe to send to the model."""
    try:
        lines = _student(user) if user.role == "student" else _staff(user)
    except Exception:  # noqa: BLE001 - context is best effort; Menta must still answer
        logger.exception("menta_context outcome=error")
        return "(Live status is unavailable right now.)"
    return "\n".join(lines)
