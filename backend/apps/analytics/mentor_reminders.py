"""Send a supportive reminder to mentors on the inactive list.

The authority is re-derived here on every call: the inactive list is evaluated again on the server for the actor's own
scope (a nurse manager's facility, or the programme for a programme admin) and a mentor is reminded only if they are
*currently* listed and remindable.  Nothing about eligibility is taken from the client, which only names who it
hopes to remind and the period it was looking at.

Rate limit, audit, the in-app notification and the plain-text email live in ``mentorship.reminders``; this module
decides who, and shapes the answer.
"""

from __future__ import annotations

from uuid import UUID

from apps.analytics import mentor_activity
from apps.core.errors import DomainError
from apps.mentorship import api as mentorship

BULK_CAP = 50


class MentorNotRemindable(DomainError):
    code = "MentorNotRemindable"
    status = 409
    message = "This mentor is not on the inactive list right now, so no reminder was sent."


class TooManyReminders(DomainError):
    code = "TooManyReminders"
    status = 422
    message = f"You can remind up to {BULK_CAP} mentors at once. Choose fewer, or use Remind all listed."


def remind(*, actor, mentor_ids: list[UUID] | None, days=None, facility_id: UUID | None = None) -> dict:
    """Remind ``mentor_ids`` (or, when ``None``, every listed mentor who can be reminded now, up to ``BULK_CAP``).

    Returns a per-mentor result and a summary.  Safe to repeat: a mentor reminded in the last three days is reported
    as ``already_reminded`` and receives nothing more.
    """
    report = mentor_activity.mentor_activity(actor=actor, days=days, facility_id=facility_id)
    listed = {row["id"]: row for row in report["results"]}
    remaining = 0
    if mentor_ids is None:
        due = [row["id"] for row in report["results"] if row["can_remind"]]
        wanted, remaining = due[:BULK_CAP], max(len(due) - BULK_CAP, 0)
    else:
        wanted = list(dict.fromkeys(str(value) for value in mentor_ids))
        if len(wanted) > BULK_CAP:
            raise TooManyReminders()

    results = []
    for mentor_id in wanted:
        row = listed.get(mentor_id)
        if row is None or not row["remindable"]:
            results.append({"mentor_id": mentor_id, "status": "not_listed", "last_reminded_at": None, "next_reminder_at": None})
            continue
        outcome = mentorship.send_reminder(
            actor=actor, mentor_id=UUID(mentor_id), reason_codes=row["reason_codes"],
            live_students=row["live_students"], days_since_last_session=row["days_since_last_session"],
        )
        results.append({
            "mentor_id": mentor_id,
            "status": "sent" if outcome.sent else "already_reminded",
            "last_reminded_at": outcome.last_reminded_at.isoformat(),
            "next_reminder_at": outcome.next_allowed_at.isoformat(),
        })
    count = lambda status: sum(1 for item in results if item["status"] == status)  # noqa: E731
    return {
        "results": results,
        "summary": {
            "sent": count("sent"), "already_reminded": count("already_reminded"), "not_listed": count("not_listed"),
            "remaining": remaining, "cap": BULK_CAP,
        },
    }


def remind_one(*, actor, mentor_id: UUID, days=None, facility_id: UUID | None = None) -> dict:
    """Single reminder.  A refusal is an error the portal can show: not listed (409) or too soon (429, with the time)."""
    result = remind(actor=actor, mentor_ids=[mentor_id], days=days, facility_id=facility_id)["results"][0]
    if result["status"] == "not_listed":
        raise MentorNotRemindable()
    if result["status"] == "already_reminded":
        raise mentorship.ReminderTooSoon(next_reminder_at=result["next_reminder_at"])
    return result

