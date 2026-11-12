"""Pending follow-ups (concept note 7.2 step 13).

A session records a ``follow_up_action``.  A follow-up is *pending* until a
``SessionFollowUp`` row exists for the session.  Nothing here ever returns the
free-text ``what_was_covered`` / ``feedback_given``: the list is a to-do list,
not a window into the session record.

Scope (resolved on the server from the signed-in user, never from the request):

* mentor: every follow-up on a placement the mentor *currently* holds, so a
  follow-up left by the previous mentor of that placement is inherited with it
  and one on a placement they have been moved off is no longer theirs;
* nurse manager: only ``supervisor_follow_up`` items, on their own facility.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from django.db.models import Case, IntegerField, Q, QuerySet, Value, When
from django.utils import timezone

from apps.mentorship.models import Session, SessionType

NO_FOLLOW_UP = ("", "none")
SUPERVISOR = "supervisor_follow_up"
STUDENT_SUPPORT = "student_referral"
NEXT_SHIFT = "review_next_shift"

DEFAULT_OVERDUE_AFTER_DAYS = 7
OVERDUE_AFTER_DAYS = {NEXT_SHIFT: 1}

#: action -> (plain-language label, suggested next step)
KINDS: dict[str, tuple[str, str]] = {
    "repeat_demonstration": ("Repeat the demonstration", "Arrange a time to show the skill again and let the student try it."),
    "review_reading": ("Review reading", "Agree which reading to revisit and check understanding with the student."),
    "practice_skill": ("Practise a skill", "Set up supervised practice of the skill on the next suitable shift."),
    NEXT_SHIFT: ("Review on next shift", "Check in with the student at the start of your next shift together."),
    SUPERVISOR: ("Supervisor review", "Speak to the nurse manager about what was raised and agree who acts."),
    STUDENT_SUPPORT: ("Student support need", "Meet the student about the support they need and involve the right people."),
    "other": ("Other follow-up", "Do what you noted for this session, then mark it done."),
}

PAGE_SIZE_DEFAULT = 20
PAGE_SIZE_MAX = 100
STATUSES = ("pending", "done", "all")


def label_for(action: str) -> str:
    return KINDS.get(action, (action.replace("_", " ").capitalize() or "Follow-up", ""))[0]


def next_step_for(action: str) -> str:
    return KINDS.get(action, ("", KINDS["other"][1]))[1]


def overdue_after(action: str) -> int:
    return OVERDUE_AFTER_DAYS.get(action, DEFAULT_OVERDUE_AFTER_DAYS)


def kind_options() -> list[dict]:
    return [{"value": value, "label": label} for value, (label, _) in KINDS.items()]


def scope_queryset(actor) -> QuerySet[Session]:
    """Sessions with a follow-up the actor is allowed to see (any state)."""
    rows = Session.objects.filter(placement__institution__program_id=actor.program_id).exclude(
        follow_up_action__in=NO_FOLLOW_UP
    )
    if actor.role == "mentor":
        return rows.filter(
            placement__mentor_assignments__mentor_id=actor.id,
            placement__mentor_assignments__ended_at__isnull=True,
        ).distinct()
    if actor.role == "nurse_manager" and actor.facility_id:
        return rows.filter(follow_up_action=SUPERVISOR, placement__facility_id=actor.facility_id)
    return rows.none()


def _overdue_q(today: dt.date) -> Q:
    """Pending rows past their allowed age (applied to a pending queryset)."""
    q = Q()
    special = list(OVERDUE_AFTER_DAYS)
    for action, days in OVERDUE_AFTER_DAYS.items():
        q |= Q(follow_up_action=action, session_date__lt=today - dt.timedelta(days=days))
    return q | (~Q(follow_up_action__in=special) & Q(session_date__lt=today - dt.timedelta(days=DEFAULT_OVERDUE_AFTER_DAYS)))


def counts(actor, *, today: dt.date | None = None) -> dict[str, int]:
    today = today or timezone.localdate()
    base = scope_queryset(actor)
    pending = base.filter(follow_up_resolution__isnull=True)
    return {
        "pending": pending.count(),
        "overdue": pending.filter(_overdue_q(today)).count(),
        "student_support": pending.filter(follow_up_action=STUDENT_SUPPORT).count(),
        "done": base.filter(follow_up_resolution__isnull=False).count(),
    }


@dataclass(frozen=True)
class Filters:
    status: str = "pending"
    action: str = ""
    placement_id: str = ""
    student_id: str = ""
    min_age_days: int | None = None
    page: int = 1
    page_size: int = PAGE_SIZE_DEFAULT


def listing(actor, filters: Filters, *, today: dt.date | None = None) -> dict:
    today = today or timezone.localdate()
    rows = scope_queryset(actor)
    if filters.status == "pending":
        rows = rows.filter(follow_up_resolution__isnull=True)
    elif filters.status == "done":
        rows = rows.filter(follow_up_resolution__isnull=False)
    if filters.action:
        rows = rows.filter(follow_up_action=filters.action)
    if filters.placement_id:
        rows = rows.filter(placement_id=filters.placement_id)
    if filters.student_id:
        rows = rows.filter(
            placement__student_assignments__student_id=filters.student_id,
            placement__student_assignments__ended_at__isnull=True,
        )
    if filters.min_age_days is not None:
        rows = rows.filter(session_date__lte=today - dt.timedelta(days=filters.min_age_days))

    if filters.status == "done":
        rows = rows.order_by("-follow_up_resolution__resolved_at", "id")
    else:
        rows = rows.annotate(
            _is_done=Case(When(follow_up_resolution__isnull=True, then=Value(0)), default=Value(1), output_field=IntegerField())
        ).order_by("_is_done", "session_date", "submitted_at", "id")

    page_size = max(1, min(filters.page_size, PAGE_SIZE_MAX))
    total = rows.count()
    pages = max(1, -(-total // page_size))
    page = max(1, min(filters.page, pages))
    window = (
        rows.select_related("follow_up_resolution__resolved_by", "placement__facility")
        .prefetch_related(
            "topics",
            "placement__student_assignments__student",
            "placement__ward_assignments__ward",
        )[(page - 1) * page_size: page * page_size]
    )
    return {
        "data": [present(session, today) for session in window],
        "meta": {
            "page": page, "page_size": page_size, "total": total, "pages": pages,
            "counts": counts(actor, today=today),
            "kinds": kind_options(),
            "students": students(actor),
        },
    }


def students(actor) -> list[dict]:
    """Students with a follow-up in scope (any state), for the filter control (names only)."""
    one_per_placement = (
        Session.objects.filter(id__in=scope_queryset(actor).values("id"))
        .order_by("placement_id", "id").distinct("placement_id")
    )
    rows = Session.objects.filter(id__in=one_per_placement.values("id")).prefetch_related(
        "placement__student_assignments__student"
    )
    seen: dict[str, dict] = {}
    for session in rows:
        student = _student_of(session)
        if student and student["id"] not in seen:
            seen[student["id"]] = student
    return sorted(seen.values(), key=lambda row: row["name"].lower())


def _student_of(session: Session) -> dict | None:
    for row in session.placement.student_assignments.all():
        if row.ended_at is None:
            return {"id": str(row.student_id), "name": row.student.full_name}
    return None


def detail(session_id, *, today: dt.date | None = None) -> dict:
    session = (
        Session.objects.select_related("follow_up_resolution__resolved_by", "placement__facility")
        .prefetch_related("topics", "placement__student_assignments__student", "placement__ward_assignments__ward")
        .get(id=session_id)
    )
    return present(session, today or timezone.localdate())


def present(session: Session, today: dt.date) -> dict:
    """The only shape a follow-up leaves the module in.  No free-text fields."""
    action = session.follow_up_action
    resolution = getattr(session, "follow_up_resolution", None)
    age = max((today - session.session_date).days, 0)
    pending = resolution is None
    ward = next((row.ward for row in session.placement.ward_assignments.all() if row.ended_at is None), None)
    return {
        "session_id": str(session.id),
        "placement_id": str(session.placement_id),
        "placement_state": session.placement.state,
        "student": _student_of(session),
        "ward": ward.name if ward else None,
        "session_date": session.session_date.isoformat(),
        "session_type": session.session_type,
        "session_type_label": SessionType(session.session_type).label if session.session_type in SessionType.values else session.session_type,
        "topics": [topic.topic for topic in session.topics.all()],
        "follow_up_action": action,
        "label": label_for(action),
        "suggested_next_step": next_step_for(action),
        "is_student_support": action == STUDENT_SUPPORT,
        "status": "pending" if pending else "done",
        "age_days": age,
        "overdue_after_days": overdue_after(action),
        "overdue": pending and age > overdue_after(action),
        "outcome": None if pending else resolution.outcome,
        "note": None if pending else resolution.note,
        "resolved_at": None if pending else resolution.resolved_at.isoformat(),
        "resolved_by": None if pending else resolution.resolved_by.full_name,
    }


def status_of(session: Session) -> dict:
    """Read-only status shown to the student: no note, no staff name."""
    if session.follow_up_action in NO_FOLLOW_UP:
        return {"state": None, "resolved_at": None}
    resolution = getattr(session, "follow_up_resolution", None)
    return {
        "state": "pending" if resolution is None else "done",
        "resolved_at": resolution.resolved_at.isoformat() if resolution else None,
    }


__all__ = ["Filters", "STATUSES", "counts", "listing", "present", "scope_queryset", "status_of"]
