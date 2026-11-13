"""The result of one allocation run, readable on its own page.

A run is either a *facility split* (a coordinator asked facilities to host students) or an *arrangement* (a nurse
manager placed incoming students into wards and mentors). This module turns the stored run into one stable shape:
a summary, per-facility and per-ward fill before and after, the mentor spread, and every student with where they
ended up (or why they did not). Live facts (current ward, mentor, state) are read fresh and flagged when they differ
from what the run did, so the page never shows a stale arrangement as current.

Scoping: a coordinator reads only the students of their own institution; a nurse manager only their facility's
arrangements; a programme admin the programme's. Anything else is "not found".
"""

from __future__ import annotations

from collections import Counter
from uuid import UUID

from django.core.paginator import Paginator

from apps.core import errors
from apps.facilities import api as facilities
from apps.identity import api as identity
from apps.placements import allocation
from apps.placements.models import AllocationRun, MentorAssignment, Placement, WardAssignment
from apps.placements.planning import STATUS_LABEL, pipeline_status


def _visible_run(actor, run_id) -> AllocationRun:
    run = AllocationRun.objects.select_related("actor", "facility", "institution").filter(id=run_id).first()
    if run is None:
        raise errors.UnauthorizedFacilityAccess()
    if actor.role == identity.ROLES.COORDINATOR:
        identity.require_capability(actor, "request_facility")
        mine = str(actor.institution_id)
        if run.institution_id != actor.institution_id and mine not in (run.institution_ids or []):
            raise errors.UnauthorizedFacilityAccess()
    else:
        identity.require_capability(actor, "arrange_placements")
        if actor.role == identity.ROLES.NURSE_MANAGER:
            if run.mode != AllocationRun.Mode.AUTO_ARRANGE or run.facility_id != actor.facility_id:
                raise errors.UnauthorizedFacilityAccess()
        else:
            programme = run.facility.program_id if run.facility_id else (run.institution.program_id if run.institution_id else None)
            if programme != actor.program_id:
                raise errors.UnauthorizedFacilityAccess()
    return run


def _stored_rows(run) -> tuple[list[dict], list[dict]]:
    """(placed rows, unplaced rows) as the run stored them."""
    result = run.result or {}
    if run.mode == AllocationRun.Mode.AUTO_ARRANGE:
        return result.get("arranged", []), result.get("unplaced", [])
    return result.get("assignments", []), result.get("unplaced", [])


def run_detail(*, actor, run_id, page: int = 1, page_size: int = 100, outcome: str = "", search: str = "") -> dict:
    run = _visible_run(actor, run_id)
    placed, unplaced = _stored_rows(run)
    ids = [UUID(r["placement_id"]) for r in [*placed, *unplaced] if r.get("placement_id")]
    live = Placement.objects.filter(id__in=ids).select_related("facility", "cohort", "requested_facility")
    if actor.role == identity.ROLES.COORDINATOR:
        live = live.filter(institution_id=actor.institution_id)
    live = {p.id: p for p in live}
    visible = set(live)
    wards = {w.placement_id: w.ward for w in WardAssignment.objects.filter(placement_id__in=visible, ended_at=None).select_related("ward")}
    mentors = {m.placement_id: m.mentor for m in MentorAssignment.objects.filter(placement_id__in=visible, ended_at=None).select_related("mentor")}
    people = allocation._student_info(visible)

    rows = []
    for outcome_name, source in (("placed", placed), ("unplaced", unplaced)):
        for item in source:
            placement = live.get(UUID(item["placement_id"])) if item.get("placement_id") else None
            if placement is None:
                continue
            ward, mentor = wards.get(placement.id), mentors.get(placement.id)
            arranged_ward = (item.get("ward") or {}).get("id")
            arranged_mentor = (item.get("mentor") or {}).get("id")
            info = people.get(placement.id) or {}
            status = pipeline_status(placement, has_ward=ward is not None, has_mentor=mentor is not None)
            rows.append({
                "placement_id": str(placement.id), "student": info.get("name") or item.get("student", ""),
                "registration_number": info.get("registration_number", ""), "cohort": placement.cohort.name,
                "outcome": outcome_name if run.mode == AllocationRun.Mode.AUTO_ARRANGE or outcome_name == "unplaced" else "requested",
                "facility": {"id": str(placement.facility_id), "name": placement.facility.name} if placement.facility_id else (
                    {"id": str(placement.requested_facility_id), "name": placement.requested_facility.name, "requested": True} if placement.requested_facility_id else None),
                "ward": {"id": str(ward.id), "name": ward.name} if ward else None,
                "mentor": {"id": str(mentor.id), "name": mentor.full_name} if mentor else None,
                "planned_start": placement.planned_start, "planned_end": placement.planned_end,
                "state": placement.state, "status": status, "status_label": STATUS_LABEL[status],
                "reason": item.get("reason", ""), "issues": item.get("issues", []),
                "moved_since": bool(run.mode == AllocationRun.Mode.AUTO_ARRANGE and outcome_name == "placed"
                                    and (str(ward.id) if ward else None, str(mentor.id) if mentor else None) != (arranged_ward, arranged_mentor)),
            })
    if outcome:
        rows = [r for r in rows if r["outcome"] == outcome]
    term = (search or "").strip().lower()
    if term:
        rows = [r for r in rows if term in r["student"].lower() or term in r["registration_number"].lower()]

    base = _summary_rows(run, live, wards, mentors, people)
    placed_rows = [r for r in base if r["outcome"] != "unplaced"]
    unplaced_rows = [r for r in base if r["outcome"] == "unplaced"]
    summary = {
        "requested": len(base), "placed": len(placed_rows), "unplaced": len(unplaced_rows),
        "with_mentor": sum(1 for r in placed_rows if r["mentor"]), "without_mentor": sum(1 for r in placed_rows if not r["mentor"]),
        "unplaced_reasons": [{"reason": reason, "count": count} for reason, count in Counter(r["reason"] or "No reason recorded" for r in unplaced_rows).most_common()],
    }
    paginator = Paginator(rows, min(max(page_size, 1), 200))
    current = paginator.get_page(page)
    is_nurse_side = actor.role in {identity.ROLES.NURSE_MANAGER, identity.ROLES.PROGRAM_ADMIN}
    can_act = is_nurse_side and run.mode == AllocationRun.Mode.AUTO_ARRANGE
    listing = {r["id"]: r for r in allocation.runs_for(actor=actor, limit=200)} if can_act else {}
    entry = listing.get(str(run.id), {})
    return {
        "run": {
            "id": str(run.id), "mode": run.mode, "status": run.status, "strategy": run.strategy, "seed": run.seed, "plan_hash": run.plan_hash,
            "created_at": run.created_at, "by": run.actor.full_name,
            "facility": {"id": str(run.facility_id), "name": run.facility.name} if run.facility_id else None,
            "institution": {"id": str(run.institution_id), "name": run.institution.name} if run.institution_id else None,
            "can_undo": bool(entry.get("can_undo")), "can_retry": bool(entry.get("can_retry")),
            "retried_by": run.summary.get("retried_by"),
        },
        "summary": summary,
        "facilities": _facility_fill(actor, run, base),
        "wards": _ward_fill(run, base),
        "mentors": _mentor_spread(actor, placed_rows),
        "placements": list(current.object_list),
        "pagination": {"page": current.number, "page_size": paginator.per_page, "total_count": paginator.count, "total_pages": paginator.num_pages,
                       "has_next": current.has_next(), "has_previous": current.has_previous()},
        "downloads": {"endpoint": "placements/allocation-list", "params": {"run_id": str(run.id)}, "formats": ["csv", "xlsx", "pdf"]},
        "detail_available": bool(placed or unplaced),
    }


def _summary_rows(run, live, wards, mentors, people):
    """Unfiltered rows for the totals, so a search box never changes the summary."""
    placed, unplaced = _stored_rows(run)
    out = []
    for outcome_name, source in (("placed", placed), ("unplaced", unplaced)):
        for item in source:
            if not item.get("placement_id") or UUID(item["placement_id"]) not in live:
                continue
            pid = UUID(item["placement_id"])
            out.append({
                "outcome": outcome_name, "reason": item.get("reason", ""), "ward": wards.get(pid), "mentor": mentors.get(pid) or None,
                "arranged_ward": item.get("ward"), "arranged_mentor": item.get("mentor"), "facility_id": live[pid].facility_id or live[pid].requested_facility_id,
            })
    return out


def _facility_fill(actor, run, base) -> list[dict]:
    if run.mode == AllocationRun.Mode.AUTO_ARRANGE:
        wards = (run.result or {}).get("wards") or []
        if not run.facility_id:
            return []
        return [{
            "facility_id": str(run.facility_id), "name": run.facility.name,
            "capacity": sum(w["capacity"] for w in wards) if wards else None,
            "before": sum(w["before"] for w in wards) if wards else None,
            "added": sum(1 for r in base if r["outcome"] == "placed"),
            "after": sum(w["after"] for w in wards) if wards else None,
            "free_after": (sum(w["capacity"] for w in wards) - sum(w["after"] for w in wards)) if wards else None,
        }]
    by_facility = (run.result or {}).get("by_facility") or {}
    names = {str(f.id): f.name for f in facilities.active_facilities(program_id=actor.program_id, facility_ids=[UUID(k) for k in by_facility])}
    return [{"facility_id": fid, "name": names.get(fid, "Facility"), "requested": count} for fid, count in by_facility.items()]


def _ward_fill(run, base) -> list[dict]:
    if run.mode != AllocationRun.Mode.AUTO_ARRANGE:
        return []
    stored = (run.result or {}).get("wards")
    if stored:
        return [{**w, "free_after": max(0, w["capacity"] - w["after"])} for w in stored]
    counts = Counter((r["arranged_ward"] or {}).get("id") for r in base if r["outcome"] == "placed" and r["arranged_ward"])
    names = {(r["arranged_ward"] or {}).get("id"): (r["arranged_ward"] or {}).get("name") for r in base if r["arranged_ward"]}
    return [{"id": wid, "name": names[wid], "capacity": None, "before": None, "added": n, "after": None, "free_after": None} for wid, n in counts.items()]


def _mentor_spread(actor, placed_rows) -> list[dict]:
    assigned = Counter(str(r["mentor"].id) for r in placed_rows if r["mentor"])
    if not assigned:
        return []
    live = {str(m.id): m for m in identity.active_mentors(program_id=actor.program_id) if str(m.id) in assigned}
    out = []
    for mentor_id, count in assigned.most_common():
        mentor = live.get(mentor_id)
        out.append({
            "id": mentor_id, "name": mentor.full_name if mentor else "Mentor", "assigned_in_run": count,
            "open_placements_now": mentor.active_placement_count if mentor else None, "limit": mentor.max_active_placements if mentor else None,
            "remaining_now": max(0, mentor.max_active_placements - mentor.active_placement_count) if mentor else None,
        })
    return out
