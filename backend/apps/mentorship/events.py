from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class SessionLogged:
    placement_id: UUID
    session_id: UUID
    mentor_id: UUID
    follow_up_action: str = ""
    recipient_user_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class MentorReminderRequested:
    """A manager's kind nudge to one mentor.  Counts and a composed sentence only: no student names, no notes.

    ``recipient_user_ids`` (one mentor) lets the dispatcher record "not emailed" when the mentor has switched
    session follow-up emails off, while the in-app notification is still delivered.
    """

    recipient_user_ids: tuple[UUID, ...]
    reminder_id: UUID
    sent_by_name: str
    reason_codes: tuple[str, ...]
    live_students: int
    days_since_last_session: int | None
    never_signed_in: bool
    message: str
