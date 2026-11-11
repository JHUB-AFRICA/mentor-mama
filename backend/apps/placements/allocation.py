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
import hashlib
import random
import secrets
from collections import defaultdict
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.core import audit, errors, outbox
from apps.facilities import api as facilities
from apps.identity import api as identity
from apps.learning import api as learning
from apps.placements import events, services
from apps.placements.models import AllocationRun, MentorAssignment, Placement, State, StudentAssignment, WardAssignment  # noqa: F401

STRATEGIES = {"balanced", "fill"}


def _seed(value: str | None) -> str:
    return value or secrets.token_hex(6)


def _student_name(placement_id) -> str:
    student_id = StudentAssignment.objects.filter(placement_id=placement_id, ended_at=None).values_list("student_id", flat=True).first()
    user = identity.user_of(student_id) if student_id else None
    return user.full_name if user else "Student"


def _ward_load(ward_id, start: dt.date, end: dt.date) -> int:
    return services.ward_load(ward_id, start, end)


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


def _plan_hash(rows) -> str:
    """Fingerprint of exactly who goes where, so apply can refuse a plan the manager did not review."""
    parts = sorted(f"{r['placement_id']}:{r['ward']['id']}:{r['mentor']['id'] if r['mentor'] else '-'}" for r in rows)
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


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
        "plan_hash": _plan_hash(placed),
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


def apply_auto_arrange(*, actor, facility_id=None, placement_ids=None, strategy: str = "balanced", seed: str | None = None, assign_mentors: bool = True, expected_plan_hash: str | None = None) -> dict:
    plan = plan_auto_arrange(actor=actor, facility_id=facility_id, placement_ids=placement_ids, strategy=strategy, seed=seed, assign_mentors=assign_mentors)
    if expected_plan_hash and expected_plan_hash != plan["plan_hash"]:
        raise errors.InvalidTransition("Things changed since you reviewed this arrangement. Please review it again before confirming.")
    facility = UUID(plan["facility_id"])
    # Record the run first, in its own transaction, so a crash part-way leaves a trail.
    run = AllocationRun.objects.create(
        mode=AllocationRun.Mode.AUTO_ARRANGE, facility_id=facility, actor=actor, strategy=plan["strategy"], seed=plan["seed"],
        plan_hash=plan["plan_hash"], status="running", summary={"planned": len(plan["assignments"])},
    )
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
        if done:
            audit.record(
                actor=actor, action="placement.auto_arrange", entity_table="placements_placement", entity_id=UUID(done[0]["placement_id"]),
                scope={"program_id": str(actor.program_id), "facility_id": str(facility)},
                changes={"arranged": len(done), "unplaced": len(unplaced), "strategy": plan["strategy"], "seed": plan["seed"]},
            )
    result = {
        "run_id": str(run.id), "seed": plan["seed"], "strategy": plan["strategy"], "arranged": done, "unplaced": unplaced,
        "summary": {"arranged": len(done), "unplaced": len(unplaced), "mentors_notified": len(per_mentor)},
    }
    run.status = "completed" if not unplaced else ("partial" if done else "failed")
    run.summary = {**result["summary"], "planned": len(plan["assignments"])}
    run.result = result
    run.save(update_fields=["status", "summary", "result", "updated_at"])
    return result


UNDO_WINDOW = dt.timedelta(hours=24)


def runs_for(*, actor, limit: int = 8):
    """Recent automatic arrangements the actor may see, newest first."""
    identity.require_capability(actor, "arrange_placements")
    rows = AllocationRun.objects.filter(mode=AllocationRun.Mode.AUTO_ARRANGE).select_related("actor").order_by("-created_at")
    if actor.role != identity.ROLES.PROGRAM_ADMIN:
        rows = rows.filter(facility_id=actor.facility_id)
    else:
        rows = rows.filter(facility__program_id=actor.program_id)
    out = []
    for run in rows[:limit]:
        undoable = run.status in {"completed", "partial"} and timezone.now() - run.created_at <= UNDO_WINDOW
        out.append({
            "id": str(run.id), "created_at": run.created_at, "by": run.actor.full_name, "strategy": run.strategy, "status": run.status,
            "arranged": run.summary.get("arranged", 0), "unplaced": run.summary.get("unplaced", 0),
            "can_undo": undoable, "can_retry": run.status in {"partial", "failed"} and bool(run.result.get("unplaced")),
        })
    return out


def _run_for_actor(actor, run_id) -> AllocationRun:
    identity.require_capability(actor, "arrange_placements")
    run = AllocationRun.objects.select_for_update().filter(id=run_id, mode=AllocationRun.Mode.AUTO_ARRANGE).first()
    if run is None or (actor.role != identity.ROLES.PROGRAM_ADMIN and run.facility_id != actor.facility_id):
        raise errors.UnauthorizedFacilityAccess()
    return run


@transaction.atomic
def undo_auto_arrange(*, actor, run_id) -> dict:
    """Put students from one recent arrangement back in the incoming queue.

    Only placements that are still where the run left them (draft or scheduled, same ward and mentor)
    are reverted; anyone who has moved on is left alone and reported.
    """
    run = _run_for_actor(actor, run_id)
    if run.status not in {"completed", "partial"}:
        raise errors.InvalidTransition("This arrangement can no longer be undone.")
    if timezone.now() - run.created_at > UNDO_WINDOW:
        raise errors.InvalidTransition("Arrangements can only be undone within 24 hours.")
    reverted, kept = 0, []
    now = timezone.now()
    for item in run.result.get("arranged", []):
        placement = Placement.objects.select_for_update().filter(id=item["placement_id"]).first()
        if placement is None:
            continue
        ward_row = WardAssignment.objects.filter(placement=placement, ended_at=None).first()
        mentor_row = MentorAssignment.objects.filter(placement=placement, ended_at=None).first()
        same_ward = ward_row is not None and str(ward_row.ward_id) == item["ward"]["id"]
        same_mentor = (mentor_row is None and not item.get("mentor")) or (mentor_row is not None and item.get("mentor") and str(mentor_row.mentor_id) == item["mentor"]["id"])
        if placement.state not in {State.DRAFT, State.SCHEDULED} or not same_ward or not same_mentor:
            kept.append({"student": item["student"], "reason": "Already moved on, so it was left as it is."})
            continue
        ward_row.ended_at = now
        ward_row.save(update_fields=["ended_at"])
        if mentor_row:
            mentor_row.ended_at = now
            mentor_row.end_reason = "arrangement undone"
            mentor_row.save(update_fields=["ended_at", "end_reason", "updated_at"])
        placement.facility_id = None
        placement.state = State.DRAFT
        placement.version += 1
        placement.save(update_fields=["facility_id", "state", "version", "updated_at"])
        reverted += 1
    run.status = "undone"
    run.summary = {**run.summary, "reverted": reverted, "kept": len(kept)}
    run.save(update_fields=["status", "summary", "updated_at"])
    audit.record(actor=actor, action="placement.undo_auto_arrange", entity_table="placements_allocation_run", entity_id=run.id,
                 scope={"program_id": str(actor.program_id), "facility_id": str(run.facility_id)}, changes={"reverted": reverted, "kept": len(kept)})
    return {"run_id": str(run.id), "reverted": reverted, "kept": kept}


def retry_unplaced(*, actor, run_id) -> dict:
    """Try again for the students a run could not place, e.g. after wards or mentors were added."""
    with transaction.atomic():
        run = _run_for_actor(actor, run_id)
        ids = [row["placement_id"] for row in run.result.get("unplaced", []) if row.get("placement_id")]
        strategy, facility = run.strategy, run.facility_id
    if not ids:
        raise errors.InvalidTransition("Nobody was left unplaced in that run.")
    return apply_auto_arrange(actor=actor, facility_id=facility, placement_ids=ids, strategy=strategy)



def _by_institution(rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[row.institution_id].append(row)
    return grouped


@transaction.atomic
def decline_requests(*, actor, placement_ids, reason: str) -> dict:
    """The facility cannot host these students. They go back to the coordinator with the reason."""
    identity.require_capability(actor, "arrange_placements")
    reason = (reason or "").strip()
    if len(reason) < 5:
        raise errors.InvalidTransition("Say briefly why the facility cannot host these students.")
    facility = _facility_for(actor, None)
    rows = list(incoming(actor=actor).filter(id__in=placement_ids).select_for_update(of=("self",)))
    if not rows:
        raise errors.InvalidTransition("Choose students from your incoming list.")
    now = timezone.now()
    for placement in rows:
        placement.declined_facility_id = facility
        placement.decline_reason = reason[:300]
        placement.declined_at = now
        placement.requested_facility_id = None
        placement.save(update_fields=["declined_facility", "decline_reason", "declined_at", "requested_facility", "updated_at"])
    for institution_id, group in _by_institution(rows).items():
        coordinators = tuple(identity.users(role=identity.ROLES.COORDINATOR, status=identity.STATUSES.ACTIVE, institution_id=institution_id).values_list("id", flat=True))
        outbox.publish(events.PlacementsDeclined(facility_id=facility, count=len(group), recipient_user_ids=coordinators))
    audit.record(actor=actor, action="placement.requests_declined", entity_table="placements_placement", entity_id=rows[0].id,
                 scope={"program_id": str(actor.program_id), "facility_id": str(facility)}, changes={"count": len(rows)}, override_reason=reason)
    return {"declined": len(rows)}


@transaction.atomic
def withdraw_requests(*, actor, placement_ids) -> dict:
    """The coordinator takes a request back before the facility has placed the student."""
    identity.require_capability(actor, "request_facility")
    rows = list(
        Placement.objects.select_for_update(of=("self",)).filter(
            id__in=placement_ids, state=State.DRAFT, facility_id=None, requested_facility_id__isnull=False,
            **({} if actor.role == identity.ROLES.PROGRAM_ADMIN else {"institution_id": actor.institution_id}),
        )
    )
    if not rows:
        raise errors.InvalidTransition("Only requests that the facility has not yet acted on can be withdrawn.")
    by_facility = defaultdict(int)
    for placement in rows:
        by_facility[placement.requested_facility_id] += 1
        placement.requested_facility_id = None
        placement.save(update_fields=["requested_facility", "updated_at"])
    for facility_id, count in by_facility.items():
        managers = tuple(identity.users(role=identity.ROLES.NURSE_MANAGER, status=identity.STATUSES.ACTIVE, facility_id=facility_id).values_list("id", flat=True))
        outbox.publish(events.PlacementRequestsWithdrawn(facility_id=facility_id, count=count, recipient_user_ids=managers))
    audit.record(actor=actor, action="placement.requests_withdrawn", entity_table="placements_placement", entity_id=rows[0].id,
                 scope={"program_id": str(actor.program_id)}, changes={"count": len(rows)})
    return {"withdrawn": len(rows)}
