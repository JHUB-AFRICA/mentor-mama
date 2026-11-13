"""Read models for the screens that plan and release a cohort's placements.

* ``overview`` / ``cohort_summary`` / ``cohort_students`` — the coordinator's planning view: the next cohort(s), every
  student in a cohort with where they are in the placement pipeline, and the capacity the programme has for the
  cohort's dates.
* ``incoming_summary`` — the nurse manager's incoming requests, grouped by institution and cohort, each with the
  manager's remaining room for those dates and a warning when the requests are more than the room.
* ``release_placements`` — release arranged placements to students in bulk, with a clear per-student result.

These are reads over placement data the caller is already allowed to see (institution for a coordinator, facility for a
nurse manager, programme for a programme admin). They hold names the placement screens already show; nothing clinical.
"""

from __future__ import annotations

import datetime as dt
from collections import Counter, defaultdict
from uuid import UUID

from django.core.paginator import Paginator
from django.db import transaction
from django.utils import timezone

from apps.core import errors, outbox
from apps.identity import api as identity
from apps.institutions import api as institutions
from apps.learning import api as learning
from apps.placements import allocation, capacity, events, selectors, services
from apps.placements.models import MentorAssignment, Placement, State, StudentAssignment, WardAssignment

#: Pipeline status codes in the order a student moves through them (also the default sort order).
STATUSES = [
    ("not_placed", "Not yet placed", "Create their placement"),
    ("not_requested", "Awaiting a facility request", "Request a facility"),
    ("declined", "Declined by facility", "Ask another facility"),
    ("requested", "Requested of a facility", "Waiting for the facility to arrange"),
    ("partly_arranged", "Partly arranged", "Waiting for a ward or mentor"),
    ("arranged", "Arranged", "Share with the student or release"),
    ("shared", "Shared with student", "Release to the student"),
    ("released", "Released, awaiting student", "Waiting for the student to confirm"),
    ("confirmed", "Confirmed, in induction", "Induction in progress"),
    ("active", "Active", ""),
    ("paused", "Paused", "Placement is paused"),
    ("completed", "Completed", ""),
    ("withdrawn", "Withdrawn", "Create a new placement if needed"),
    ("archived", "Archived", ""),
]
STATUS_CODES = [code for code, _, _ in STATUSES]
STATUS_LABEL = {code: label for code, label, _ in STATUSES}
STATUS_ACTION = {code: action for code, _, action in STATUSES}
SORTS = {"name", "registration_number", "status", "start", "facility", "ward", "mentor"}
LIVE_STATES = {State.DRAFT, State.SCHEDULED, State.AWAITING_STUDENT, State.ORIENTATION, State.INDUCTION, State.ACTIVE, State.PAUSED}


def pipeline_status(placement: Placement | None, *, has_ward: bool, has_mentor: bool) -> str:
    """Where one student is in the pipeline, from facts the placement already holds."""
    if placement is None:
        return "not_placed"
    state = placement.state
    if state == State.DRAFT:
        if placement.facility_id is not None:  # a ward is held but the set is not complete yet
            return "partly_arranged"
        if placement.requested_facility_id is not None:
            return "requested"
        return "declined" if placement.declined_facility_id is not None else "not_requested"
    if state == State.SCHEDULED:
        return "shared" if placement.provisional_notice_hash else "arranged"
    if state == State.AWAITING_STUDENT:
        return "released"
    if state in {State.ORIENTATION, State.INDUCTION}:
        return "confirmed"
    return str(state) if str(state) in {"active", "paused", "completed", "withdrawn", "archived"} else "archived"


def _scope_institution(actor, institution_id=None):
    identity.require_capability(actor, "create_placement")
    if actor.role == identity.ROLES.PROGRAM_ADMIN:
        return institution_id
    return actor.institution_id


def _mentor_trained(program, mentor, cache: dict) -> bool:
    if mentor.id not in cache:
        cache[mentor.id] = (not program.require_mentor_training_before_placement) or learning.required_modules_complete(mentor)
    return cache[mentor.id]


def _cohort_rows(actor, cohort) -> list[dict]:
    """One row per student in the cohort, with their current placement (if any) and release readiness."""
    students = list(institutions.cohort_students(cohort_id=cohort.id, program_id=actor.program_id, institution_id=cohort.institution_id))
    placements = list(Placement.objects.filter(cohort_id=cohort.id).select_related("facility", "requested_facility", "declined_facility"))
    ids = [p.id for p in placements]
    owner = dict(StudentAssignment.objects.filter(placement_id__in=ids, ended_at=None).values_list("placement_id", "student_id"))
    wards = {row.placement_id: row.ward for row in WardAssignment.objects.filter(placement_id__in=ids, ended_at=None).select_related("ward")}
    mentors = {row.placement_id: row.mentor for row in MentorAssignment.objects.filter(placement_id__in=ids, ended_at=None).select_related("mentor")}
    by_student: dict[UUID, list[Placement]] = defaultdict(list)
    for placement in placements:
        student_id = owner.get(placement.id)
        if student_id:
            by_student[student_id].append(placement)

    program = actor.program
    trained: dict = {}
    rows = []
    for student in students:
        mine = by_student.get(student.id, [])
        live = [p for p in mine if p.state in LIVE_STATES or p.state == State.COMPLETED]
        placement = max(live or mine, key=lambda p: p.created_at) if mine else None
        ward, mentor = (wards.get(placement.id), mentors.get(placement.id)) if placement else (None, None)
        code = pipeline_status(placement, has_ward=ward is not None, has_mentor=mentor is not None)
        blockers: list[str] = []
        ready = False
        if placement is not None and placement.state == State.SCHEDULED:
            if ward is None or mentor is None or placement.facility_id is None:
                blockers.append("Ward or mentor is missing.")
            elif not _mentor_trained(program, mentor, trained):
                blockers.append("The mentor has not finished required training.")
            ready = not blockers
        rows.append({
            "student": {"id": str(student.id), "name": student.full_name, "email": student.email,
                        "registration_number": student.registration_number or "", "account_status": student.status},
            "placement_id": str(placement.id) if placement else None,
            "status": code, "status_label": STATUS_LABEL[code], "next_action": STATUS_ACTION[code],
            "state": placement.state if placement else None,
            "facility": {"id": str(placement.facility_id), "name": placement.facility.name} if placement and placement.facility_id else None,
            "requested_facility": {"id": str(placement.requested_facility_id), "name": placement.requested_facility.name} if placement and placement.requested_facility_id else None,
            "requested_at": placement.requested_at if placement and placement.requested_facility_id else None,
            "declined": ({"facility": placement.declined_facility.name, "reason": placement.decline_reason, "at": placement.declined_at}
                         if placement and placement.declined_facility_id and code == "declined" else None),
            "ward": {"id": str(ward.id), "name": ward.name} if ward else None,
            "mentor": {"id": str(mentor.id), "name": mentor.full_name} if mentor else None,
            "planned_start": placement.planned_start if placement else None,
            "planned_end": placement.planned_end if placement else None,
            "shared_at": placement.provisional_notice_at if placement and code in {"shared", "released", "confirmed", "active"} else None,
            "ready_to_release": ready, "blockers": blockers,
            "needs_attention": code in {"declined", "partly_arranged", "not_placed", "not_requested"},
        })
    return rows


def _counts(rows) -> dict:
    counter = Counter(row["status"] for row in rows)
    out = {code: counter.get(code, 0) for code in STATUS_CODES}
    out["total"] = len(rows)
    out["ready_to_release"] = sum(1 for row in rows if row["ready_to_release"])
    out["needs_attention"] = sum(1 for row in rows if row["needs_attention"])
    return out


def _cohort_or_404(actor, cohort_id, institution_id=None):
    scope_institution = _scope_institution(actor, institution_id)
    cohort = institutions.scoped_cohorts(program_id=actor.program_id, institution_id=scope_institution).filter(id=cohort_id).first()
    if cohort is None:
        raise errors.UnauthorizedFacilityAccess()
    return cohort


def _cohort_card(cohort, rows, today) -> dict:
    return {
        "id": str(cohort.id), "name": cohort.name, "institution_id": str(cohort.institution_id), "institution_name": cohort.institution.name,
        "start_date": cohort.start_date, "end_date": cohort.end_date, "planned_capacity": cohort.planned_capacity,
        "phase": "upcoming" if cohort.start_date > today else "current",
        "days_until_start": max((cohort.start_date - today).days, 0) if cohort.start_date > today else 0,
        "counts": _counts(rows),
    }


def overview(*, actor, institution_id=None, limit: int = 6) -> dict:
    """The cohorts a coordinator is planning: upcoming first (soonest start), then the ones already under way."""
    scope_institution = _scope_institution(actor, institution_id)
    today = timezone.localdate()
    cohorts = [c for c in institutions.scoped_cohorts(program_id=actor.program_id, institution_id=scope_institution) if c.end_date >= today]
    cohorts.sort(key=lambda c: (c.start_date <= today, c.start_date))
    cards = [_cohort_card(c, _cohort_rows(actor, c), today) for c in cohorts[:limit]]
    upcoming = [card for card in cards if card["phase"] == "upcoming"]
    return {
        "today": today, "cohorts": cards, "next_cohort_id": upcoming[0]["id"] if upcoming else (cards[0]["id"] if cards else None),
        "statuses": [{"code": code, "label": label} for code, label, _ in STATUSES],
    }


def _window(cohort, rows) -> tuple[dt.date, dt.date, str]:
    starts = [row["planned_start"] for row in rows if row["planned_start"] and row["state"] in {s.value for s in LIVE_STATES}]
    ends = [row["planned_end"] for row in rows if row["planned_end"] and row["state"] in {s.value for s in LIVE_STATES}]
    if starts and ends:
        return min(starts), max(ends), "placements"
    return cohort.start_date, cohort.end_date, "cohort"


def cohort_summary(*, actor, cohort_id, institution_id=None) -> dict:
    """One cohort: counts per status, its placement window, and the programme's free places for those dates."""
    cohort = _cohort_or_404(actor, cohort_id, institution_id)
    rows = _cohort_rows(actor, cohort)
    start, end, basis = _window(cohort, rows)
    facilities_ctx = capacity.facility_capacity(program_id=actor.program_id, start=start, end=end)
    total_free = sum(f["free"] for f in facilities_ctx)
    to_place = sum(1 for r in rows if r["status"] in {"not_placed", "not_requested", "declined"})
    in_queue = sum(1 for r in rows if r["status"] == "requested")
    warnings = []
    if to_place + in_queue > total_free:
        warnings.append(f"{to_place + in_queue} students still need a place but the programme has {total_free} free places for {start:%d %b} to {end:%d %b}.")
    return {
        "cohort": _cohort_card(cohort, rows, timezone.localdate()),
        "window": {"start": start, "end": end, "basis": basis},
        "capacity": {
            "total_free": total_free, "total_capacity": sum(f["capacity"] for f in facilities_ctx),
            "students_to_place": to_place, "students_in_facility_queues": in_queue,
            "shortfall": max(0, to_place + in_queue - total_free), "facilities": facilities_ctx,
        },
        "warnings": warnings,
    }


def _sort_key(sort):
    def pick(row):
        if sort == "name":
            return row["student"]["name"].lower()
        if sort == "registration_number":
            return row["student"]["registration_number"].lower()
        if sort == "start":
            return (row["planned_start"] is None, row["planned_start"] or dt.date.max)
        if sort == "facility":
            return ((row["facility"] or row["requested_facility"] or {}).get("name") or "~").lower()
        if sort == "ward":
            return ((row["ward"] or {}).get("name") or "~").lower()
        if sort == "mentor":
            return ((row["mentor"] or {}).get("name") or "~").lower()
        return STATUS_CODES.index(row["status"])
    return pick


def cohort_students(*, actor, cohort_id, institution_id=None, status: str = "", search: str = "", facility_id: str = "", ward_id: str = "", ready: bool | None = None,
                    needs_attention: bool | None = None, sort: str = "status", order: str = "asc", page: int = 1, page_size: int = 50,
                    ids_only: bool = False) -> dict:
    """Every student in the cohort with their pipeline status; filter, search, sort and page (counts cover the whole cohort)."""
    cohort = _cohort_or_404(actor, cohort_id, institution_id)
    if sort not in SORTS:
        raise errors.InvalidTransition("Unknown sort.")
    wanted = {value for value in (status or "").split(",") if value}
    unknown = wanted - set(STATUS_CODES)
    if unknown:
        raise errors.InvalidTransition("Unknown status filter.")
    all_rows = _cohort_rows(actor, cohort)
    counts = _counts(all_rows)
    rows = all_rows
    if wanted:
        rows = [r for r in rows if r["status"] in wanted]
    if ready is not None:
        rows = [r for r in rows if r["ready_to_release"] is ready]
    if needs_attention is not None:
        rows = [r for r in rows if r["needs_attention"] is needs_attention]
    if facility_id:
        rows = [r for r in rows if facility_id in {(r["facility"] or {}).get("id"), (r["requested_facility"] or {}).get("id")}]
    if ward_id:
        rows = [r for r in rows if (r["ward"] or {}).get("id") == ward_id]
    term = (search or "").strip().lower()
    if term:
        rows = [r for r in rows if term in r["student"]["name"].lower() or term in r["student"]["email"].lower() or term in r["student"]["registration_number"].lower()]
    rows = sorted(rows, key=lambda r: (_sort_key(sort)(r), r["student"]["name"].lower()), reverse=(order == "desc"))
    if ids_only:
        return {
            "count": len(rows), "placement_ids": [r["placement_id"] for r in rows if r["placement_id"]],
            "student_ids": [r["student"]["id"] for r in rows], "without_placement_student_ids": [r["student"]["id"] for r in rows if not r["placement_id"]],
        }
    paginator = Paginator(rows, min(max(page_size, 1), 100))
    current = paginator.get_page(page)
    return {
        "cohort": {"id": str(cohort.id), "name": cohort.name, "start_date": cohort.start_date, "end_date": cohort.end_date},
        "counts": counts, "results": list(current.object_list),
        "pagination": {"page": current.number, "page_size": paginator.per_page, "total_count": paginator.count, "total_pages": paginator.num_pages,
                       "has_next": current.has_next(), "has_previous": current.has_previous()},
    }


# ------------------------------------------------------------------ nurse manager: incoming requests


def incoming_summary(*, actor, facility_id=None) -> dict:
    """Requests waiting for this facility, grouped by institution and cohort, against its room for those dates."""
    queue = list(allocation.incoming(actor=actor, facility_id=facility_id))
    facility = allocation._facility_for(actor, facility_id)
    names = allocation._student_info([p.id for p in queue])
    groups: dict[tuple, dict] = {}
    for placement in queue:
        key = (placement.institution_id, placement.cohort_id, placement.planned_start, placement.planned_end)
        group = groups.get(key)
        if group is None:
            group = groups[key] = {
                "institution": {"id": str(placement.institution_id), "name": placement.cohort.institution.name},
                "cohort": {"id": str(placement.cohort_id), "name": placement.cohort.name},
                "planned_start": placement.planned_start, "planned_end": placement.planned_end,
                "count": 0, "placement_ids": [], "students": [], "requested_since": None, "latest_request": None,
            }
        group["count"] += 1
        group["placement_ids"].append(str(placement.id))
        group["students"].append({"placement_id": str(placement.id), "name": (names.get(placement.id) or {}).get("name", "Student"),
                                  "registration_number": (names.get(placement.id) or {}).get("registration_number", "")})
        stamp = placement.requested_at or placement.updated_at
        group["requested_since"] = min(filter(None, [group["requested_since"], stamp]))
        group["latest_request"] = max(filter(None, [group["latest_request"], stamp]))

    contexts: dict[tuple, dict] = {}
    out = []
    for group in sorted(groups.values(), key=lambda g: (g["planned_start"], g["institution"]["name"], g["cohort"]["name"])):
        window = (group["planned_start"], group["planned_end"])
        if window not in contexts:
            rows = capacity.facility_capacity(program_id=actor.program_id, start=window[0], end=window[1], facility_ids=[facility])
            contexts[window] = rows[0] if rows else {"wards": [], "free": 0, "capacity": 0, "occupied": 0, "mentors": {"remaining": 0, "accepting": 0, "mentors": 0, "at_limit": 0}}
        ctx = contexts[window]
        free, mentor_room = ctx["free"], ctx["mentors"]["remaining"]
        warnings = []
        if group["count"] > free:
            warnings.append(f"{group['count']} students are requested but only {free} ward places are free for these dates. {group['count'] - free} would stay unplaced.")
        if group["count"] > mentor_room:
            warnings.append(f"Only {mentor_room} mentor places are left, so some students would need a mentor assigned later.")
        out.append({
            **group,
            "capacity": {"free": free, "capacity": ctx["capacity"], "occupied": ctx["occupied"], "wards": ctx["wards"], "mentor_places_left": mentor_room},
            "shortfall": max(0, group["count"] - free), "over_capacity": group["count"] > free, "warnings": warnings,
        })
    total = len(queue)
    overall = None
    if queue:
        start, end = min(p.planned_start for p in queue), max(p.planned_end for p in queue)
        rows = capacity.facility_capacity(program_id=actor.program_id, start=start, end=end, facility_ids=[facility])
        overall = rows[0] if rows else None
    return {
        "facility_id": str(facility), "total_requested": total, "groups": out,
        "capacity": ({"free": overall["free"], "capacity": overall["capacity"], "occupied": overall["occupied"], "wards": overall["wards"],
                      "mentors": overall["mentors"], "window": {"start": start, "end": end}} if overall else None),
        "over_capacity": bool(overall and total > overall["free"]),
        "latest_run": (allocation.runs_for(actor=actor, limit=1) or [None])[0],
    }


# ------------------------------------------------------------------ coordinator: release in bulk


def release_placements(*, actor, placement_ids=None, cohort_id=None) -> dict:
    """Release arranged placements to their students (scheduled -> awaiting the student), one by one, reporting each.

    Safe to repeat: placements already released are counted, not changed. A placement that cannot be released (for
    example its mentor has not finished required training) is reported with the reason and left as it is; it never
    stops the others.
    """
    identity.require_capability(actor, "release_placement")
    scope = identity.resolve_scope(actor)
    rows = selectors.in_scope(scope).filter(state__in=[State.DRAFT, State.SCHEDULED, State.AWAITING_STUDENT])
    if placement_ids:
        rows = rows.filter(id__in=placement_ids)
    elif cohort_id:
        rows = rows.filter(cohort_id=cohort_id)
    else:
        raise errors.InvalidTransition("Choose the students to release, or a cohort.")
    placements = list(rows.order_by("planned_start", "id"))
    names = allocation._student_info([p.id for p in placements])
    released, already, not_arranged, blocked = [], 0, 0, []
    for placement in placements:
        who = (names.get(placement.id) or {}).get("name", "Student")
        if placement.state == State.AWAITING_STUDENT:
            already += 1
            continue
        if placement.state == State.DRAFT:
            not_arranged += 1  # the facility still has to give a ward and a mentor; not an error, so not listed
            continue
        try:
            with transaction.atomic():
                services.transition(placement.id, State.AWAITING_STUDENT, actor=actor)
                student_id = (names.get(placement.id) or {}).get("student_id")
                if student_id:
                    outbox.publish(events.PlacementInvitationIssued(placement_id=placement.id, student_id=UUID(student_id)))
            released.append({"placement_id": str(placement.id), "student": who})
        except errors.DomainError as exc:
            blocked.append({"placement_id": str(placement.id), "student": who, "reason": exc.message})
    return {"released": len(released), "already_released": already, "not_arranged": not_arranged, "blocked": blocked,
            "released_students": released, "total": len(placements)}
