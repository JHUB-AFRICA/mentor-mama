"""Automatic placement arrangement (ADR 0028).

Two small, explainable steps replace one-by-one manual placing, and each step
stays with the role that already owns it:

1. **Request** (coordinator) — choose partner facilities for a batch of draft
   placements, either by hand or by splitting the batch across the chosen
   facilities in proportion to the capacity each facility has declared. This only
   writes ``requested_facility``; it allocates nothing.
2. **Arrange** (nurse manager) — for the students requested of their facility,
   fill the wards they set up (respecting capacity over the placement window) and
   spread students across mentors who are accepting and under their workload
   limit. Each assignment goes through the ordinary ``allocate_ward`` and
   ``assign_mentor`` commands, so every guard, audit row and event still applies.

Both steps support a preview with the same seed, so the result of "Apply" is the
result that was reviewed. The seed is stored with the run for repeatability.
"""

from __future__ import annotations

import datetime as dt
import random
import secrets
from collections import defaultdict
from uuid import UUID

from django.db import transaction

from apps.core import audit, errors, outbox
from apps.facilities import api as facilities
from apps.identity import api as identity
from apps.learning import api as learning
from apps.placements import events, services
from apps.placements.models import AllocationRun, MentorAssignment, Placement, State, StudentAssignment, WardAssignment  # noqa: F401

#: Placements that hold, or will hold, a ward place during their window.
PIPELINE_STATES = [
    State.SCHEDULED, State.AWAITING_STUDENT, State.ORIENTATION, State.INDUCTION, State.ACTIVE, State.PAUSED, State.DRAFT,
]
STRATEGIES = {"balanced", "fill"}


def _seed(value: str | None) -> str:
    return value or secrets.token_hex(6)


def _student_name(placement_id) -> str:
    student_id = StudentAssignment.objects.filter(placement_id=placement_id, ended_at=None).values_list("student_id", flat=True).first()
    user = identity.user_of(student_id) if student_id else None
    return user.full_name if user else "Student"


def _ward_load(ward_id, start: dt.date, end: dt.date) -> int:
    """Students already holding a place on this ward at any point in the window."""
    return WardAssignment.objects.filter(
        ward_id=ward_id, ended_at=None, placement__state__in=PIPELINE_STATES,
        placement__planned_start__lte=end, placement__planned_end__gte=start,
    ).count()


def facility_free_capacity(facility_id, start: dt.date, end: dt.date, program_id) -> int:
    wards = list(facilities.scoped_wards(program_id=program_id, facility_id=facility_id))
    return sum(max(0, ward.max_students - _ward_load(ward.id, start, end)) for ward in wards)


# --------------------------------------------------------------------- request


def _draft_unrequested(actor, placement_ids):
    rows = Placement.objects.filter(id__in=placement_ids, state=State.DRAFT, facility_id=None)
    if actor.role != identity.ROLES.PROGRAM_ADMIN:
        return rows.filter(institution_id=actor.institution_id)
    return rows.filter(institution__program_id=actor.program_id)


def plan_facility_split(*, actor, placement_ids, facility_ids, mode: str = "capacity", seed: str | None = None) -> dict:
    """Preview how a batch would be requested of partner facilities."""
    identity.require_capability(actor, "request_facility")
    rows = list(_draft_unrequested(actor, placement_ids).order_by("planned_start"))
    if not rows:
        raise errors.InvalidTransition("Choose draft placements that have not been allocated to a ward yet.")
    if not facility_ids:
        raise errors.InvalidTransition("Choose at least one partner facility.")
    seed = _seed(seed)
    rng = random.Random(seed)
    start, end = min(r.planned_start for r in rows), max(r.planned_end for r in rows)

    options = [
        {"facility_id": str(fid), "free": facility_free_capacity(fid, start, end, actor.program_id)}
        for fid in facility_ids
    ]
    shuffled = rows[:]
    rng.shuffle(shuffled)

    total_free = sum(option["free"] for option in options)
    if mode == "capacity" and total_free > 0:
        # Largest-remainder split in proportion to declared free capacity, never above it.
        shares = {o["facility_id"]: min(o["free"], len(shuffled) * o["free"] / total_free) for o in options}
        quotas = {fid: int(share) for fid, share in shares.items()}
        leftover = min(len(shuffled), total_free) - sum(quotas.values())
        for option in sorted(options, key=lambda o: shares[o["facility_id"]] - quotas[o["facility_id"]], reverse=True):
            if leftover <= 0:
                break
            if quotas[option["facility_id"]] < option["free"]:
                quotas[option["facility_id"]] += 1
                leftover -= 1
    else:  # even split: each facility decides what it can really take
        base, extra = divmod(len(shuffled), len(options))
        quotas = {o["facility_id"]: base + (1 if index < extra else 0) for index, o in enumerate(options)}

    assignments, cursor = [], 0
    for option in options:
        count = quotas.get(option["facility_id"], 0)
        for placement in shuffled[cursor:cursor + count]:
            assignments.append({"placement_id": str(placement.id), "student": _student_name(placement.id), "facility_id": option["facility_id"]})
        cursor += count
    unplaced = [
        {"placement_id": str(p.id), "student": _student_name(p.id), "reason": "No declared capacity left across the chosen facilities."}
        for p in shuffled[cursor:]
    ]
    return {
        "seed": seed, "mode": mode,
        "facilities": [{"facility_id": o["facility_id"], "free_capacity": o["free"], "requested": quotas.get(o["facility_id"], 0)} for o in options],
        "assignments": assignments, "unplaced": unplaced,
        "window": {"start": start.isoformat(), "end": end.isoformat()},
    }


def apply_facility_split(*, actor, placement_ids, facility_ids, mode: str = "capacity", seed: str | None = None) -> dict:
    plan = plan_facility_split(actor=actor, placement_ids=placement_ids, facility_ids=facility_ids, mode=mode, seed=seed)
    return _record_requests(actor, plan["assignments"], plan)


def request_facility(*, actor, placement_ids, facility_id) -> dict:
    """Ask one facility to host all of these placements."""
    identity.require_capability(actor, "request_facility")
    rows = list(_draft_unrequested(actor, placement_ids))
    if not rows:
        raise errors.InvalidTransition("Choose draft placements that have not been allocated to a ward yet.")
    assignments = [{"placement_id": str(p.id), "facility_id": str(facility_id)} for p in rows]
    return _record_requests(actor, assignments, {"mode": "manual", "seed": "", "unplaced": []})


def _record_requests(actor, assignments, plan) -> dict:
    if not assignments:
        raise errors.InvalidTransition("Nothing could be requested with the chosen facilities.")
    by_facility = defaultdict(list)
    for item in assignments:
        by_facility[item["facility_id"]].append(item["placement_id"])
    with transaction.atomic():
        for facility_id, ids in by_facility.items():
            Placement.objects.filter(id__in=ids, state=State.DRAFT, facility_id=None).update(requested_facility_id=facility_id)
            managers = tuple(
                identity.users(role=identity.ROLES.NURSE_MANAGER, status=identity.STATUSES.ACTIVE, facility_id=facility_id).values_list("id", flat=True)
            )
            outbox.publish(events.PlacementsRequested(facility_id=UUID(facility_id), count=len(ids), recipient_user_ids=managers))
        AllocationRun.objects.create(
            mode=AllocationRun.Mode.FACILITY_SPLIT, actor=actor, institution_id=actor.institution_id,
            strategy=str(plan.get("mode", "manual")), seed=str(plan.get("seed", "")),
            summary={"requested": {fid: len(ids) for fid, ids in by_facility.items()}, "unplaced": len(plan.get("unplaced", []))},
        )
        audit.record(
            actor=actor, action="placement.facility_requested", entity_table="placements_placement",
            entity_id=UUID(assignments[0]["placement_id"]), scope={"program_id": str(actor.program_id)},
            changes={"count": len(assignments), "facilities": len(by_facility)},
        )
    return {"requested": len(assignments), "by_facility": {fid: len(ids) for fid, ids in by_facility.items()}, "unplaced": plan.get("unplaced", [])}


# --------------------------------------------------------------------- arrange


def _facility_for(actor, facility_id):
    if actor.role == identity.ROLES.NURSE_MANAGER:
        return actor.facility_id
    if not facility_id:
        raise errors.InvalidTransition("Choose the facility to arrange.")
    return facility_id


def incoming(*, actor, facility_id=None):
    identity.require_capability(actor, "arrange_placements")
    facility = _facility_for(actor, facility_id)
    return Placement.objects.filter(state=State.DRAFT, facility_id=None, requested_facility_id=facility).select_related("cohort").order_by("planned_start", "created_at")


def plan_auto_arrange(*, actor, facility_id=None, placement_ids=None, strategy: str = "balanced", seed: str | None = None, assign_mentors: bool = True) -> dict:
    identity.require_capability(actor, "arrange_placements")
    if strategy not in STRATEGIES:
        raise errors.InvalidTransition("Unknown arrangement strategy.")
    facility = _facility_for(actor, facility_id)
    rows = incoming(actor=actor, facility_id=facility)
    if placement_ids:
        rows = rows.filter(id__in=placement_ids)
    candidates = list(rows)
    seed = _seed(seed)
    rng = random.Random(seed)
    rng.shuffle(candidates)  # a fair, repeatable random order: nobody is favoured by list position

    wards = list(facilities.scoped_wards(program_id=actor.program_id, facility_id=facility))
    mentor_state = {}
    for mentor in identity.active_mentors(program_id=actor.program_id, facility_id=facility):
        accepting = mentor.accepting_students and mentor.status == identity.STATUSES.ACTIVE
        mentor_state[mentor.id] = {
            "user": mentor,
            "remaining": max(0, mentor.max_active_placements - mentor.active_placement_count) if accepting else 0,
            "planned": 0,
            "trained": learning.required_modules_complete(mentor),
        }
    planned_per_ward = defaultdict(list)

    def ward_state(ward, start, end):
        taken = _ward_load(ward.id, start, end) + sum(1 for s, e in planned_per_ward[ward.id] if s <= end and e >= start)
        return ward.max_students - taken, taken

    placed, unplaced = [], []
    for placement in candidates:
        start, end = placement.planned_start, placement.planned_end
        usable = []
        for ward in wards:
            free, taken = ward_state(ward, start, end)
            if free > 0:
                usable.append((ward, free, taken))
        row = {
            "placement_id": str(placement.id), "student": _student_name(placement.id), "cohort": placement.cohort.name,
            "window": [start.isoformat(), end.isoformat()], "ward": None, "mentor": None, "issues": [],
        }
        if not usable:
            unplaced.append({**row, "reason": "Every ward is full for these dates."})
            continue
        if strategy == "fill":
            ward = usable[0][0]
        else:  # balanced: the emptiest ward by share of its capacity
            ward = min(usable, key=lambda item: (item[2] / item[0].max_students, -item[1], item[0].name))[0]
        planned_per_ward[ward.id].append((start, end))
        row["ward"] = {"id": str(ward.id), "name": ward.name}

        if assign_mentors:
            options = [m for m in mentor_state.values() if m["remaining"] - m["planned"] > 0]
            if options:
                chosen = max(options, key=lambda m: (m["trained"], m["remaining"] - m["planned"], -m["planned"]))
                chosen["planned"] += 1
                row["mentor"] = {"id": str(chosen["user"].id), "name": chosen["user"].full_name, "trained": chosen["trained"]}
                if not chosen["trained"]:
                    row["issues"].append("Mentor has not finished required training; release will be blocked until they do.")
            else:
                row["issues"].append("No mentor has capacity left. Assign one manually to schedule this placement.")
        placed.append(row)

    return {
        "seed": seed, "strategy": strategy, "facility_id": str(facility),
        "assignments": placed, "unplaced": unplaced,
        "summary": {
            "incoming": len(candidates), "arranged": len(placed), "unplaced": len(unplaced),
            "with_mentor": sum(1 for r in placed if r["mentor"]),
            "wards": [{"id": str(w.id), "name": w.name, "capacity": w.max_students, "added": len(planned_per_ward[w.id])} for w in wards],
            "mentors": [
                {"id": str(m["user"].id), "name": m["user"].full_name, "assigned": m["planned"], "remaining": m["remaining"] - m["planned"]}
                for m in mentor_state.values() if m["planned"] or m["remaining"]
            ],
        },
    }


def apply_auto_arrange(*, actor, facility_id=None, placement_ids=None, strategy: str = "balanced", seed: str | None = None, assign_mentors: bool = True) -> dict:
    plan = plan_auto_arrange(actor=actor, facility_id=facility_id, placement_ids=placement_ids, strategy=strategy, seed=seed, assign_mentors=assign_mentors)
    facility = UUID(plan["facility_id"])
    done, failed = [], []
    per_mentor = defaultdict(int)
    institutions = set()
    with services.quiet_notifications():
        for row in plan["assignments"]:
            placement_id = UUID(row["placement_id"])
            try:
                with transaction.atomic():  # a placement is never left half-arranged
                    services.allocate_ward(placement_id, UUID(row["ward"]["id"]), actor=actor)
                    if row["mentor"]:
                        services.assign_mentor(placement_id, UUID(row["mentor"]["id"]), actor=actor)
            except errors.DomainError as exc:
                failed.append({**row, "reason": exc.message})
                continue
            done.append(row)
            if row["mentor"]:
                per_mentor[row["mentor"]["id"]] += 1
            institutions.add(Placement.objects.values_list("institution_id", flat=True).get(id=placement_id))
    unplaced = plan["unplaced"] + failed

    with transaction.atomic():
        for mentor_id, count in per_mentor.items():
            outbox.publish(events.MentorPlacementsAssigned(mentor_id=UUID(mentor_id), count=count, recipient_user_ids=(UUID(mentor_id),)))
        for institution_id in institutions:
            coordinators = tuple(
                identity.users(role=identity.ROLES.COORDINATOR, status=identity.STATUSES.ACTIVE, institution_id=institution_id).values_list("id", flat=True)
            )
            outbox.publish(events.PlacementsArranged(facility_id=facility, arranged=len(done), unplaced=len(unplaced), recipient_user_ids=coordinators))
        AllocationRun.objects.create(
            mode=AllocationRun.Mode.AUTO_ARRANGE, facility_id=facility, actor=actor, strategy=plan["strategy"], seed=plan["seed"],
            summary={"arranged": len(done), "unplaced": len(unplaced), "mentors_notified": len(per_mentor)},
        )
        if done:
            audit.record(
                actor=actor, action="placement.auto_arrange", entity_table="placements_placement", entity_id=UUID(done[0]["placement_id"]),
                scope={"program_id": str(actor.program_id), "facility_id": str(facility)},
                changes={"arranged": len(done), "unplaced": len(unplaced), "strategy": plan["strategy"], "seed": plan["seed"]},
            )
    return {
        "seed": plan["seed"], "strategy": plan["strategy"], "arranged": done, "unplaced": unplaced,
        "summary": {"arranged": len(done), "unplaced": len(unplaced), "mentors_notified": len(per_mentor)},
    }
