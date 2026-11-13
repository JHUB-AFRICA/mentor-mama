"""Mentors who may need support: the "inactive mentors" read model.

Purpose: visibility so a nurse manager can reach out and help, never a score or a sanction. Only session
metadata is read (dates and counts); no session text, scores or student names are returned.

Definition (documented in the portal too). A mentor appears as INACTIVE when they belong to the manager's
facility and at least one of these is true:

* ``no_recent_session``: the account is active and the mentor has at least one live placement
  (orientation, induction, active or paused), but has logged no session in the last ``days`` days
  (default 14, allowed 7 to 60). A session exactly ``days`` days ago still counts as recent.
* ``never_logged``: active, has live students and has never logged a session. A mentor assigned to their
  first live placement less than ``days`` days ago is given that time before being listed.
* ``not_signed_in``: the account is active but has never signed in.
* ``invitation_pending``: the account is still invited (the invitation has not been accepted).

Suspended and deactivated accounts are never listed, and active mentors with no live students are listed
only for the account reasons above.

Separate flag (not part of "inactive"): ``induction_waiting`` is true when a live placement of the mentor has
an induction checklist that has been open longer than ``INDUCTION_WAITING_DAYS`` without sign-off.

Scope: nurse managers see only mentors whose account belongs to their facility; programme admins see the
programme (optionally one facility via ``facility_id``). Everyone else is refused.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from uuid import UUID

from django.db.models import Count, Max
from django.utils import timezone

from apps.core.errors import DomainError, UnauthorizedFacilityAccess
from apps.identity.models import Role, Status, User
from apps.identity.scope import resolve
from apps.learning import versioning
from apps.learning.models import ModuleCompletion, TrainingModule
from apps.mentorship import api as mentorship
from apps.mentorship.models import Session
from apps.placements.models import MentorAssignment, State, StudentAssignment

DEFAULT_DAYS = 14
MIN_DAYS = 7
MAX_DAYS = 60
INDUCTION_WAITING_DAYS = 7
LIVE_STATES = [State.ORIENTATION, State.INDUCTION, State.ACTIVE, State.PAUSED]
ALLOWED_ROLES = {Role.NURSE_MANAGER, Role.PROGRAM_ADMIN}
REMINDER_CODES = {"not_signed_in", "never_logged", "no_recent_session"}


class InvalidActivityWindow(DomainError):
    code = "InvalidActivityWindow"
    status = 400
    message = f"Choose a period between {MIN_DAYS} and {MAX_DAYS} days."


def parse_days(raw) -> int:
    if raw in (None, ""):
        return DEFAULT_DAYS
    try:
        days = int(raw)
    except (TypeError, ValueError):
        raise InvalidActivityWindow() from None
    if not MIN_DAYS <= days <= MAX_DAYS:
        raise InvalidActivityWindow()
    return days


def _plural(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


def _required_progress(program_id, mentor_ids) -> dict:
    modules = list(TrainingModule.objects.filter(
        program_id=program_id, is_published=True, archived_at=None, is_required=True,
        visible_roles__contains=[Role.MENTOR],
    ))
    done: dict = defaultdict(int)
    if modules:
        for completion in ModuleCompletion.objects.filter(user_id__in=mentor_ids, module__in=modules).select_related("module"):
            if versioning.completion_counts(completion.module, completion):
                done[completion.user_id] += 1
    return {"total": len(modules), "done": done}


def mentor_activity(*, actor, days=DEFAULT_DAYS, facility_id: UUID | None = None) -> dict:
    if actor.status != Status.ACTIVE or actor.role not in ALLOWED_ROLES:
        raise UnauthorizedFacilityAccess()
    days = parse_days(days)
    scope = resolve(actor)
    if scope.role == Role.NURSE_MANAGER:
        if not scope.facility_id:
            raise UnauthorizedFacilityAccess()
        facility_id = scope.facility_id  # a requested facility is ignored: the manager's own is the only one
    today = timezone.localdate()
    window_start = today - timedelta(days=days)

    mentors = User.objects.filter(
        program_id=scope.program_id, role=Role.MENTOR, status__in=[Status.ACTIVE, Status.INVITED],
    )
    mentors = mentors.filter(facility_id=facility_id) if facility_id else mentors.exclude(facility_id=None)
    mentors = list(mentors.order_by("first_name", "last_name", "email"))
    ids = [m.id for m in mentors]

    live = MentorAssignment.objects.filter(mentor_id__in=ids, ended_at=None, placement__state__in=LIVE_STATES)
    if facility_id:
        live = live.filter(placement__facility_id=facility_id)
    live_rows = list(live.values("mentor_id", "placement_id", "started_at"))
    placements_by_mentor: dict = defaultdict(set)
    first_assigned: dict = {}
    for row in live_rows:
        placements_by_mentor[row["mentor_id"]].add(row["placement_id"])
        started = row["started_at"].date()
        first_assigned[row["mentor_id"]] = min(first_assigned.get(row["mentor_id"], started), started)
    all_placement_ids = {pid for pids in placements_by_mentor.values() for pid in pids}

    students_by_placement: dict = defaultdict(set)
    for placement_id, student_id in StudentAssignment.objects.filter(
        placement_id__in=all_placement_ids, ended_at=None,
    ).values_list("placement_id", "student_id"):
        students_by_placement[placement_id].add(student_id)
    recent_placements = set(
        Session.objects.filter(placement_id__in=all_placement_ids, session_date__gte=window_start)
        .values_list("placement_id", flat=True).distinct()
    )

    session_facts = {
        row["mentor_assignment__mentor_id"]: row
        for row in Session.objects.filter(mentor_assignment__mentor_id__in=ids)
        .values("mentor_assignment__mentor_id")
        .annotate(last=Max("session_date"), total=Count("id"))
    }
    in_window = dict(
        Session.objects.filter(mentor_assignment__mentor_id__in=ids, session_date__gte=window_start)
        .values_list("mentor_assignment__mentor_id").annotate(n=Count("id"))
    )
    waiting_cutoff = timezone.now() - timedelta(days=INDUCTION_WAITING_DAYS)
    waiting: dict = defaultdict(int)
    for placement_id, mentor_id in live.filter(
        placement__induction_checklist__completed_at=None,
        placement__induction_checklist__opened_at__lt=waiting_cutoff,
    ).values_list("placement_id", "mentor_id"):
        waiting[mentor_id] += 1
    training = _required_progress(scope.program_id, ids)
    reminded = mentorship.last_reminded(ids)
    now = timezone.now()

    rows = []
    for mentor in mentors:
        placement_ids = placements_by_mentor.get(mentor.id, set())
        students = set().union(*(students_by_placement.get(pid, set()) for pid in placement_ids)) if placement_ids else set()
        quiet = {s for pid in placement_ids if pid not in recent_placements for s in students_by_placement.get(pid, set())}
        facts = session_facts.get(mentor.id)
        last_session = facts["last"] if facts else None
        days_since = (today - last_session).days if last_session else None

        reasons: list[str] = []
        codes: list[str] = []
        if mentor.status == Status.INVITED:
            codes.append("invitation_pending")
            reasons.append("Invitation not accepted yet")
        else:
            if mentor.last_login is None:
                codes.append("not_signed_in")
                reasons.append("Has not signed in yet")
            if placement_ids:
                if last_session is None:
                    if first_assigned[mentor.id] <= window_start:
                        codes.append("never_logged")
                        reasons.append("Never logged a session")
                elif last_session < window_start:
                    codes.append("no_recent_session")
                    reasons.append(f"No session in {_plural(days_since, 'day')}")
        inductions = waiting.get(mentor.id, 0)
        inactive = bool(codes)
        if not inactive and not inductions:
            continue
        last_reminded = reminded.get(mentor.id)
        next_reminder = mentorship.reminder_next_allowed(last_reminded)
        # Remindable = listed as inactive for a reason a nudge can help with.  Invited accounts have no sign-in yet,
        # so they need a fresh invitation (People & access), not a reminder.
        remindable = inactive and mentor.status == Status.ACTIVE and bool(set(codes) & REMINDER_CODES)
        rows.append({
            "id": str(mentor.id), "name": mentor.full_name or mentor.email, "email": mentor.email,
            "status": mentor.status,
            "last_sign_in": mentor.last_login.isoformat() if mentor.last_login else None,
            "last_session_date": last_session.isoformat() if last_session else None,
            "days_since_last_session": days_since,
            "sessions_in_window": in_window.get(mentor.id, 0),
            "live_placements": len(placement_ids),
            "live_students": len(students),
            "students_without_recent_session": len(quiet),
            "training": {"required_completed": training["done"].get(mentor.id, 0), "required_total": training["total"]},
            "accepting_students": mentor.accepting_students,
            "inactive": inactive,
            "remindable": remindable,
            "can_remind": remindable and (next_reminder is None or now >= next_reminder),
            "last_reminded_at": last_reminded.isoformat() if last_reminded else None,
            "next_reminder_at": next_reminder.isoformat() if next_reminder else None,
            "reason_codes": codes,
            "reasons": reasons,
            "induction_waiting": inductions > 0,
            "inductions_waiting": inductions,
            "induction_note": f"{_plural(inductions, 'induction')} open for over {INDUCTION_WAITING_DAYS} days" if inductions else "",
        })

    # Longest quiet first; mentors who never logged a session come before everyone else.
    rows.sort(key=lambda r: (not r["inactive"], r["days_since_last_session"] is not None, -(r["days_since_last_session"] or 0), r["name"].lower()))
    return {
        "definition": {
            "days": days, "min_days": MIN_DAYS, "max_days": MAX_DAYS, "default_days": DEFAULT_DAYS,
            "induction_waiting_days": INDUCTION_WAITING_DAYS,
            "live_states": [s.value for s in LIVE_STATES],
        },
        "as_of": today.isoformat(),
        "summary": {
            "inactive": sum(1 for r in rows if r["inactive"]),
            "induction_waiting": sum(1 for r in rows if r["induction_waiting"]),
            "mentors_considered": len(mentors),
        },
        "results": rows,
    }
