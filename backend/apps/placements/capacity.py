"""Capacity context: how many students each facility and ward can still take for a given set of dates.

One rule for everything that asks "is there room?" (the split across facilities, the arrangement into wards, the
coordinator's planning overview and the nurse manager's incoming queue):

* occupancy is **overlap-aware**: a student counts against a ward if their planned dates touch the window being
  asked about (``services.ward_load`` is the single-ward form of the same predicate, used by admission under lock);
* archived wards and archived facilities are not counted at all; a facility with no active wards offers nothing;
* requested-but-not-yet-arranged students are reported separately (``pending_requests``) so the screens can warn
  when the queue is longer than the room. They do not reduce ``free`` (a request is not a reservation).

Reads only; every figure is a count, never a person.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from uuid import UUID

from django.db.models import Count

from apps.facilities import api as facilities
from apps.identity import api as identity
from apps.placements.models import Placement, State, WardAssignment
from apps.placements.services import WARD_PIPELINE_STATES


def ward_loads(ward_ids, start: dt.date, end: dt.date) -> dict[UUID, int]:
    """Students holding a place on each ward at any point in [start, end] (one query)."""
    rows = (
        WardAssignment.objects.filter(
            ward_id__in=list(ward_ids), ended_at=None, placement__state__in=WARD_PIPELINE_STATES,
            placement__planned_start__lte=end, placement__planned_end__gte=start,
        ).values("ward_id").annotate(n=Count("id"))
    )
    return {row["ward_id"]: row["n"] for row in rows}


def pending_requests(facility_ids, start: dt.date, end: dt.date) -> dict[UUID, int]:
    """Draft students asked of each facility, not yet arranged, whose dates touch the window."""
    rows = (
        Placement.objects.filter(
            state=State.DRAFT, facility_id=None, requested_facility_id__in=list(facility_ids),
            planned_start__lte=end, planned_end__gte=start,
        ).values("requested_facility_id").annotate(n=Count("id"))
    )
    return {row["requested_facility_id"]: row["n"] for row in rows}


def mentor_headroom(program_id, facility_ids=None) -> dict[UUID, dict]:
    """Per facility: mentors, how many accept students and how many more placements they can take."""
    out: dict[UUID, dict] = defaultdict(lambda: {"mentors": 0, "accepting": 0, "remaining": 0, "at_limit": 0})
    for mentor in identity.active_mentors(program_id=program_id):
        if mentor.facility_id is None or (facility_ids is not None and mentor.facility_id not in facility_ids):
            continue
        row = out[mentor.facility_id]
        row["mentors"] += 1
        room = max(0, mentor.max_active_placements - mentor.active_placement_count)
        if mentor.accepting_students:
            row["accepting"] += 1
            row["remaining"] += room
            if room == 0:
                row["at_limit"] += 1
    return out


def facility_capacity(*, program_id, start: dt.date, end: dt.date, facility_ids=None) -> list[dict]:
    """Free places per facility and per ward for these dates, across the whole programme by default."""
    wards = list(facilities.scoped_wards(program_id=program_id, facility_id=None))
    if facility_ids is not None:
        wanted = {UUID(str(value)) for value in facility_ids}
        wards = [ward for ward in wards if ward.facility_id in wanted]
    else:
        wanted = None
    loads = ward_loads([ward.id for ward in wards], start, end)

    by_facility: dict[UUID, dict] = {}
    for facility in facilities.active_facilities(program_id=program_id, facility_ids=wanted):
        by_facility[facility.id] = {
            "facility_id": str(facility.id), "name": facility.name, "county": facility.county, "wards": [],
            "capacity": 0, "occupied": 0, "free": 0,
        }
    for ward in wards:
        row = by_facility.get(ward.facility_id)
        if row is None:
            continue
        occupied = loads.get(ward.id, 0)
        free = max(0, ward.max_students - occupied)
        row["wards"].append({
            "ward_id": str(ward.id), "name": ward.name, "shift_pattern": ward.shift_pattern, "capacity": ward.max_students,
            "occupied": occupied, "free": free, "over_capacity": occupied > ward.max_students,
        })
        row["capacity"] += ward.max_students
        row["occupied"] += occupied
        row["free"] += free

    queue = pending_requests(list(by_facility), start, end)
    headroom = mentor_headroom(program_id, set(by_facility))
    for facility_id, row in by_facility.items():
        row["pending_requests"] = queue.get(facility_id, 0)
        row["mentors"] = dict(headroom.get(facility_id) or {"mentors": 0, "accepting": 0, "remaining": 0, "at_limit": 0})
        row["no_wards"] = not row["wards"]
        warnings = []
        if row["no_wards"]:
            warnings.append("This facility has no active wards, so it cannot take students yet.")
        elif row["pending_requests"] > row["free"]:
            warnings.append(f"{row['pending_requests']} students are already requested for {row['free']} free places on these dates.")
        if not row["no_wards"] and row["mentors"]["remaining"] < row["free"]:
            warnings.append("Fewer mentor places than ward places: some students would need a mentor assigned later.")
        row["warnings"] = warnings
    return sorted(by_facility.values(), key=lambda item: item["name"])
