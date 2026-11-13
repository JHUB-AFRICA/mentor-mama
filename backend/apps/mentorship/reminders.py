"""Supportive reminders to mentors who have gone quiet (sent by a nurse manager or programme admin).

Who may be reminded is decided by the caller (``analytics.mentor_activity`` re-evaluates the inactive list on the
server); this module owns the rules that belong to the reminder itself:

* at most one reminder per mentor per ``INTERVAL`` (3 days).  A second attempt inside that window sends nothing and
  reports when the next one is allowed, which also makes a repeated bulk send harmless;
* the mentor row is locked while checking and recording, so two managers pressing the button together send one;
* every send is audited and published as an outbox event, so the in-app notification and the plain-text email go
  through the normal notification pipeline (and the safe email backend);
* the message is built from counts only.  It never names a student.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from uuid import UUID

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.core import audit, outbox
from apps.core.errors import DomainError
from apps.identity import api as identity
from apps.mentorship import events
from apps.mentorship.models import MentorReminder

INTERVAL = dt.timedelta(days=3)
BULK_CAP = 50
TABLE = "mentorship_mentor_reminder"


class ReminderTooSoon(DomainError):
    code = "ReminderTooSoon"
    status = 429
    message = "This mentor was reminded recently. Please give them a few days before reminding again."


def last_reminded(mentor_ids) -> dict[UUID, dt.datetime]:
    rows = (
        MentorReminder.objects.filter(mentor_id__in=list(mentor_ids))
        .values("mentor_id").annotate(last=Max("sent_at")).values_list("mentor_id", "last")
    )
    return dict(rows)


def next_allowed(last: dt.datetime | None) -> dt.datetime | None:
    return last + INTERVAL if last else None


def _plural(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


def compose(*, reason_codes, live_students: int, days_since_last_session: int | None) -> str:
    """One kind, reason-aware sentence group.  Counts only."""
    codes = set(reason_codes)
    students = f"You have {_plural(live_students, 'student')}" if live_students else ""
    if "not_signed_in" in codes:
        waiting = f"{students} waiting to hear from you, and we" if students else "We"
        return (
            f"{waiting} would love to see you on MentorMAMA. Signing in takes a minute, and once you are in, "
            "logging a session works even from your phone and offline."
        )
    if "never_logged" in codes:
        lead = f"{students} and no session logged yet." if students else "You have not logged a session yet."
    else:
        gap = f"in {_plural(days_since_last_session, 'day')}" if days_since_last_session is not None else "recently"
        lead = f"{students} and no session logged {gap}." if students else f"You have no session logged {gap}."
    return f"{lead} Logging takes about a minute, even from your phone, and works offline."


@dataclass(frozen=True)
class Outcome:
    sent: bool
    reminder: MentorReminder | None
    last_reminded_at: dt.datetime
    next_allowed_at: dt.datetime


def send(*, actor, mentor_id: UUID, reason_codes, live_students: int, days_since_last_session: int | None,
         now: dt.datetime | None = None) -> Outcome:
    """Send one reminder unless the mentor was reminded inside ``INTERVAL`` (then nothing is sent)."""
    now = now or timezone.now()
    with transaction.atomic():
        mentor = identity.users(id=mentor_id).select_for_update().first()
        if mentor is None:
            raise DomainError("Not found.")
        latest = last_reminded([mentor.id]).get(mentor.id)
        if latest is not None and now < latest + INTERVAL:
            return Outcome(False, None, latest, latest + INTERVAL)
        codes = [code for code in reason_codes if code in {"not_signed_in", "never_logged", "no_recent_session"}]
        reminder = MentorReminder.objects.create(mentor=mentor, sent_by=actor, reason_codes=codes, sent_at=now)
        audit.record(
            actor=actor, action="mentor.reminder_send", entity_table=TABLE, entity_id=reminder.id,
            scope={"facility_id": str(mentor.facility_id) if mentor.facility_id else None},
            changes={"mentor_id": str(mentor.id), "reason_codes": codes},
        )
        outbox.publish(events.MentorReminderRequested(
            recipient_user_ids=(mentor.id,), reminder_id=reminder.id,
            sent_by_name=actor.full_name or actor.email, reason_codes=tuple(codes),
            live_students=live_students, days_since_last_session=days_since_last_session,
            never_signed_in="not_signed_in" in codes,
            message=compose(reason_codes=codes, live_students=live_students, days_since_last_session=days_since_last_session),
        ))
    return Outcome(True, reminder, now, now + INTERVAL)
