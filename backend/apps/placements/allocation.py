"""Automatic placement arrangement (ADR 0028).

Two small, explainable steps replace one-by-one manual placing, and each step
stays with the role that already owns it:

1. **Request** (coordinator) — choose partner facilities for a batch of draft
   placements, either by hand or by splitting the batch across the chosen
   facilities in proportion to the free ward places each has for the placement
   dates. This only writes ``requested_facility``; it allocates nothing.
2. **Arrange** (nurse manager) — for the students requested of their facility,
   fill the wards they set up (respecting capacity over the placement window) and
   spread students across mentors who are accepting and under their workload
   limit. Each assignment goes through the ordinary ``allocate_ward`` and
   ``assign_mentor`` commands, so every guard, audit row and event still applies.

Both steps support a preview with the same seed, so the result of "Apply" is the
result that was reviewed; ``plan_hash`` makes that checkable. The seed is stored
with the run for repeatability. Capacity comes from ``capacity.py`` (one rule).
"""

from __future__ import annotations

import datetime as dt
import hashlib
import logging
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
from apps.placements import capacity, events, services
from apps.placements.models import AllocationRun, MentorAssignment, Placement, State, StudentAssignment, WardAssignment

logger = logging.getLogger(__name__)

STRATEGIES = {"balanced", "fill"}
CAPACITY_BASES = {"wards", "wards_and_mentors"}


def _seed(value: str | None) -> str:
    return value or secrets.token_hex(6)


def _student_info(placement_ids) -> dict:
    """Name and registration number of each placement's student, in one query."""
    rows = StudentAssignment.objects.filter(placement_id__in=list(placement_ids), ended_at=None).select_related("student")
    return {
        row.placement_id: {"student_id": str(row.student_id), "name": row.student.full_name, "registration_number": row.student.registration_number or ""}
        for row in rows
    }


def _student_name(placement_id) -> str:
    info = _student_info([placement_id]).get(placement_id)
    return info["name"] if info else "Student"


def _ward_load(ward_id, start: dt.date, end: dt.date) -> int:
    return services.ward_load(ward_id, start, end)


def facility_free_capacity(facility_id, start: dt.date, end: dt.date, program_id) -> int:
    rows = capacity.facility_capacity(program_id=program_id, start=start, end=end, facility_ids=[facility_id])
    return rows[0]["free"] if rows else 0


# --------------------------------------------------------------------- request


def _scoped_placements(actor):
    if actor.role != identity.ROLES.PROGRAM_ADMIN:
        return Placement.objects.filter(institution_id=actor.institution_id)
    return Placement.objects.filter(institution__program_id=actor.program_id)


def _draft_unrequested(actor, placement_ids):
    return _scoped_placements(actor).filter(id__in=placement_ids, state=State.DRAFT, facility_id=None, requested_facility_id=None)


def _requestable(actor, placement_ids):
    """Split the chosen placements into those that can be requested and those that cannot (with a reason each)."""
    ids = list(dict.fromkeys(placement_ids))
    found = {p.id: p for p in _scoped_placements(actor).filter(id__in=ids).select_related("requested_facility")}
    names = _student_info(found)
    eligible, skipped = [], []
    for pid in ids:
        placement = found.get(pid)
        who = (names.get(pid) or {}).get("name", "Student")
        if placement is None:
            skipped.append({"placement_id": str(pid), "student": "", "reason": "Not found for your institution."})
        elif placement.state != State.DRAFT or placement.facility_id is not None:
            skipped.append({"placement_id": str(pid), "student": who, "reason": "Already placed in a ward."})
        elif placement.requested_facility_id is not None:
            skipped.append({"placement_id": str(pid), "student": who, "reason": f"Already requested of {placement.requested_facility.name}. Withdraw that request first."})
        else:
            eligible.append(placement)
    return eligible, skipped


def _plan_hash_split(assignments) -> str:
    parts = sorted(f"{a['placement_id']}:{a['facility_id']}" for a in assignments)
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


def plan_facility_split(*, actor, placement_ids, facility_ids, mode: str = "capacity", seed: str | None = None,
                        basis: str = "wards", net_of_pending: bool = False, candidates=None, names=None) -> dict:
    """Preview how a batch would be requested of partner facilities.

    ``candidates`` (with ``names``) lets the cohort-wide auto request plan students who have no placement yet: each
    needs ``id``, ``planned_start``, ``planned_end`` and ``created_at``. Normal callers pass ``placement_ids``.

    ``capacity`` mode shares the batch in proportion to each facility's free ward places for the placement dates
    (never above them); students beyond the total free places are reported unplaced. ``even`` mode shares equally
    and leaves each facility to decide. ``basis="wards_and_mentors"`` also caps a facility at the mentor places it
    has left; ``net_of_pending`` subtracts students already requested of it by anyone.
    """
    identity.require_capability(actor, "request_facility")
    if mode not in {"capacity", "even"} or basis not in CAPACITY_BASES:
        raise errors.InvalidTransition("Unknown way of splitting the students.")
    if candidates is None:
        rows, skipped = _requestable(actor, placement_ids)
    else:
        rows, skipped = list(candidates), []
    if not rows:
        raise errors.InvalidTransition("Choose draft placements that have not been requested or allocated to a ward yet.", skipped=skipped)
    facility_ids = list(dict.fromkeys(UUID(str(value)) for value in facility_ids))
    if not facility_ids:
        raise errors.InvalidTransition("Choose at least one partner facility.")
    rows.sort(key=lambda p: (p.planned_start, p.created_at, str(p.id)))
    seed = _seed(seed)
    rng = random.Random(seed)
    start, end = min(r.planned_start for r in rows), max(r.planned_end for r in rows)

    context = {row["facility_id"]: row for row in capacity.facility_capacity(program_id=actor.program_id, start=start, end=end, facility_ids=facility_ids)}
    if len(context) != len(facility_ids):
        raise errors.InvalidTransition("One of the chosen facilities is not an active partner in this programme.")
    options = []
    for facility_id in facility_ids:
        row = context[str(facility_id)]
        usable = row["free"]
        if basis == "wards_and_mentors":
            usable = min(usable, row["mentors"]["remaining"])
        if net_of_pending:
            usable = max(0, usable - row["pending_requests"])
        options.append({"facility_id": str(facility_id), "name": row["name"], "free": usable, "context": row})

    shuffled = rows[:]
    rng.shuffle(shuffled)

    total_free = sum(option["free"] for option in options)
    if mode == "capacity":
        # Largest-remainder split in proportion to free places, never above them. No room anywhere means nobody is
        # requested: it must not quietly turn into an even split that the facilities cannot honour.
        if total_free > 0:
            shares = {o["facility_id"]: min(o["free"], len(shuffled) * o["free"] / total_free) for o in options}
            quotas = {fid: int(share) for fid, share in shares.items()}
            leftover = min(len(shuffled), total_free) - sum(quotas.values())
            for option in sorted(options, key=lambda o: shares[o["facility_id"]] - quotas[o["facility_id"]], reverse=True):
                if leftover <= 0:
                    break
                if quotas[option["facility_id"]] < option["free"]:
                    quotas[option["facility_id"]] += 1
                    leftover -= 1
        else:
            quotas = {o["facility_id"]: 0 for o in options}
    else:  # even split: each facility decides what it can really take
        base, extra = divmod(len(shuffled), len(options))
        quotas = {o["facility_id"]: base + (1 if index < extra else 0) for index, o in enumerate(options)}

    info = names if names is not None else _student_info([p.id for p in shuffled])
    assignments, cursor = [], 0
    for option in options:
        count = quotas.get(option["facility_id"], 0)
        for placement in shuffled[cursor:cursor + count]:
            assignments.append({"placement_id": str(placement.id), "student": (info.get(placement.id) or {}).get("name", "Student"), "facility_id": option["facility_id"]})
        cursor += count
    if total_free <= 0 and mode == "capacity":
        reason = "None of the chosen facilities has a free ward place for these dates."
    else:
        reason = f"The chosen facilities have {total_free} free places for these dates, fewer than the {len(shuffled)} students."
    unplaced = [{"placement_id": str(p.id), "student": (info.get(p.id) or {}).get("name", "Student"), "reason": reason} for p in shuffled[cursor:]]
    warnings = []
    for option in options:
        requested = quotas.get(option["facility_id"], 0)
        if requested > option["context"]["free"]:
            warnings.append(f"{option['name']} would receive {requested} requests for {option['context']['free']} free places.")
        warnings.extend(f"{option['name']}: {text}" for text in option["context"]["warnings"])
    return {
        "seed": seed, "mode": mode, "basis": basis, "net_of_pending": net_of_pending,
        "plan_hash": _plan_hash_split(assignments),
        "facilities": [
            {
                "facility_id": o["facility_id"], "name": o["name"], "free_capacity": o["context"]["free"], "usable_capacity": o["free"],
                "requested": quotas.get(o["facility_id"], 0), "pending_requests": o["context"]["pending_requests"],
                "mentor_places_left": o["context"]["mentors"]["remaining"], "wards": o["context"]["wards"],
            }
            for o in options
        ],
        "assignments": assignments, "unplaced": unplaced, "skipped": skipped, "warnings": warnings,
        "window": {"start": start.isoformat(), "end": end.isoformat()},
    }


def apply_facility_split(*, actor, placement_ids, facility_ids, mode: str = "capacity", seed: str | None = None,
                         basis: str = "wards", net_of_pending: bool = False, expected_plan_hash: str | None = None) -> dict:
    plan = plan_facility_split(actor=actor, placement_ids=placement_ids, facility_ids=facility_ids, mode=mode, seed=seed, basis=basis, net_of_pending=net_of_pending)
    if expected_plan_hash and expected_plan_hash != plan["plan_hash"]:
        raise errors.InvalidTransition("Things changed since you reviewed this split. Please review it again before confirming.")
    return _record_requests(actor, plan["assignments"], plan)


def _auto_candidates(actor, cohort):
    """Everyone in the cohort who still needs a facility: no placement yet, a draft not yet requested, or declined."""
    from types import SimpleNamespace

    from apps.placements import planning

    rows = [r for r in planning._cohort_rows(actor, cohort) if r["status"] in {"not_placed", "not_requested", "declined"}]
    stamp = timezone.now()
    candidates, names = [], {}
    for r in sorted(rows, key=lambda r: r["student"]["name"].lower()):
        student_id = UUID(r["student"]["id"])
        candidates.append(SimpleNamespace(
            id=student_id, placement_id=r["placement_id"],
            planned_start=r["planned_start"] or cohort.start_date, planned_end=r["planned_end"] or cohort.end_date, created_at=stamp,
        ))
        names[student_id] = {"name": r["student"]["name"]}
    return candidates, names


def plan_cohort_auto_request(*, actor, cohort_id, facility_ids=None, mode: str = "capacity", basis: str = "wards",
                             net_of_pending: bool = False, seed: str | None = None, institution_id=None) -> dict:
    """Share every student who still needs a facility across the partner facilities (nothing is written)."""
    from apps.placements import planning

    identity.require_capability(actor, "request_facility")
    cohort = planning._cohort_or_404(actor, cohort_id, institution_id)
    candidates, names = _auto_candidates(actor, cohort)
    if not candidates:
        raise errors.InvalidTransition("Every student in this cohort has already been sent to a facility or placed.")
    if not facility_ids:
        start, end = min(c.planned_start for c in candidates), max(c.planned_end for c in candidates)
        facility_ids = [UUID(row["facility_id"]) for row in capacity.facility_capacity(program_id=actor.program_id, start=start, end=end) if not row.get("no_wards")]
        if not facility_ids:
            raise errors.InvalidTransition("No partner facility with wards is set up yet.")
    plan = plan_facility_split(actor=actor, placement_ids=[], facility_ids=facility_ids, mode=mode, seed=seed, basis=basis,
                               net_of_pending=net_of_pending, candidates=candidates, names=names)
    existing = {c.id: c.placement_id for c in candidates}
    for item in plan["assignments"] + plan["unplaced"]:
        student_id = UUID(item["placement_id"])
        item["student_id"] = str(student_id)
        item["placement_id"] = existing.get(student_id)
    plan["cohort"] = {"id": str(cohort.id), "name": cohort.name}
    plan["to_create"] = sum(1 for a in plan["assignments"] if not a["placement_id"])
    plan["candidates"] = len(candidates)
    return plan


def apply_cohort_auto_request(*, actor, cohort_id, facility_ids=None, mode: str = "capacity", basis: str = "wards",
                              net_of_pending: bool = False, seed: str | None = None, expected_plan_hash: str | None = None,
                              institution_id=None) -> dict:
    """Create the missing draft placements and request the facilities, all or nothing."""
    from apps.placements import planning

    plan = plan_cohort_auto_request(actor=actor, cohort_id=cohort_id, facility_ids=facility_ids, mode=mode, basis=basis,
                                    net_of_pending=net_of_pending, seed=seed, institution_id=institution_id)
    if expected_plan_hash and expected_plan_hash != plan["plan_hash"]:
        raise errors.InvalidTransition("Things changed since you reviewed this split. Please review it again before confirming.")
    cohort = planning._cohort_or_404(actor, cohort_id, institution_id)
    with transaction.atomic():
        skipped = list(plan["skipped"])
        to_create = [a for a in plan["assignments"] if not a["placement_id"]]
        made: dict[str, str] = {}
        if to_create:
            created = services.bulk_create_placements(
                services.BulkCreatePlacements(cohort_id=cohort.id, student_ids=[UUID(a["student_id"]) for a in to_create],
                                              planned_start=cohort.start_date, planned_end=cohort.end_date), actor=actor)["created"]
            made = {str(student_id): str(placement_id) for placement_id, student_id in
                    StudentAssignment.objects.filter(placement_id__in=[p.id for p in created], ended_at=None).values_list("placement_id", "student_id")}
        assignments = []
        for item in plan["assignments"]:
            placement_id = item["placement_id"] or made.get(item["student_id"])
            if placement_id:
                assignments.append({"placement_id": str(placement_id), "student": item["student"], "facility_id": item["facility_id"]})
            else:
                skipped.append({"placement_id": None, "student": item["student"], "reason": "Already has an overlapping placement, so none was created."})
        return _record_requests(actor, assignments, {**plan, "skipped": skipped})


def request_facility(*, actor, placement_ids, facility_id) -> dict:
    """Ask one facility to host all of these placements."""
    identity.require_capability(actor, "request_facility")
    if not facilities.facility_belongs_to_program(facility_id=facility_id, program_id=actor.program_id):
        raise errors.InvalidTransition("Choose an active partner facility in this programme.")
    rows, skipped = _requestable(actor, placement_ids)
    if not rows:
        raise errors.InvalidTransition("Choose draft placements that have not been requested or allocated to a ward yet.", skipped=skipped)
    assignments = [{"placement_id": str(p.id), "facility_id": str(facility_id)} for p in rows]
    return _record_requests(actor, assignments, {"mode": "manual", "seed": "", "unplaced": [], "skipped": skipped})


def _record_requests(actor, assignments, plan) -> dict:
    if not assignments:
        raise errors.InvalidTransition("Nothing could be requested with the chosen facilities.")
    now = timezone.now()
    skipped = list(plan.get("skipped", []))
    with transaction.atomic():
        # Lock in a fixed order so two coordinators submitting overlapping batches cannot deadlock or overwrite each other.
        locked = {
            p.id: p for p in Placement.objects.select_for_update(of=("self",)).filter(
                id__in=[a["placement_id"] for a in assignments], state=State.DRAFT, facility_id=None, requested_facility_id=None,
            ).order_by("id")
        }
        by_facility = defaultdict(list)
        for item in assignments:
            if UUID(item["placement_id"]) in locked:
                by_facility[item["facility_id"]].append(item["placement_id"])
            else:
                skipped.append({"placement_id": item["placement_id"], "student": item.get("student", ""), "reason": "Changed while you were working, so it was left as it is."})
        if not by_facility:
            raise errors.InvalidTransition("Nothing could be requested: those students were already requested or placed.", skipped=skipped)
        requested_total = sum(len(ids) for ids in by_facility.values())
        for facility_id, ids in by_facility.items():
            Placement.objects.filter(id__in=ids).update(requested_facility_id=facility_id, requested_at=now, updated_at=now)
            managers = tuple(
                identity.users(role=identity.ROLES.NURSE_MANAGER, status=identity.STATUSES.ACTIVE, facility_id=facility_id).values_list("id", flat=True)
            )
            outbox.publish(events.PlacementsRequested(facility_id=UUID(facility_id), count=len(ids), recipient_user_ids=managers))
        institution_ids = sorted({str(p.institution_id) for p in locked.values()})
        result = {
            "requested": requested_total, "by_facility": {fid: len(ids) for fid, ids in by_facility.items()},
            "unplaced": plan.get("unplaced", []), "skipped": skipped,
            "assignments": [a for a in assignments if UUID(a["placement_id"]) in locked],
        }
        run = AllocationRun.objects.create(
            mode=AllocationRun.Mode.FACILITY_SPLIT, actor=actor, institution_id=actor.institution_id or next(iter(locked.values())).institution_id,
            strategy=str(plan.get("mode", "manual")), seed=str(plan.get("seed", "")), plan_hash=str(plan.get("plan_hash", "")),
            summary={"requested": result["by_facility"], "unplaced": len(plan.get("unplaced", [])), "skipped": len(skipped)},
            result=result, institution_ids=institution_ids,
        )
        audit.record(
            actor=actor, action="placement.facility_requested", entity_table="placements_placement",
            entity_id=UUID(next(iter(by_facility.values()))[0]), scope={"program_id": str(actor.program_id)},
            changes={"count": requested_total, "facilities": len(by_facility), "run_id": str(run.id)},
        )
    return {**{k: v for k, v in result.items() if k != "assignments"}, "run_id": str(run.id), "seed": run.seed}


# --------------------------------------------------------------------- arrange


def _facility_for(actor, facility_id):
    if actor.role == identity.ROLES.NURSE_MANAGER:
        return actor.facility_id
    if not facility_id:
        raise errors.InvalidTransition("Choose the facility to arrange.")
    if not facilities.facility_belongs_to_program(facility_id=facility_id, program_id=actor.program_id):
        raise errors.InvalidTransition("Choose an active partner facility in this programme.")
    return facility_id


def incoming(*, actor, facility_id=None):
    identity.require_capability(actor, "arrange_placements")
    facility = _facility_for(actor, facility_id)
    return (
        Placement.objects.filter(state=State.DRAFT, facility_id=None, requested_facility_id=facility)
        .select_related("cohort", "cohort__institution", "requested_facility").order_by("planned_start", "created_at", "id")
    )


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
    names = _student_info([p.id for p in candidates])

    wards = list(facilities.scoped_wards(program_id=actor.program_id, facility_id=facility))
    # One query for everybody already holding a place, then plain arithmetic per student (no query per student and ward).
    held = defaultdict(list)
    for ward_id, start, end in WardAssignment.objects.filter(
        ward_id__in=[w.id for w in wards], ended_at=None, placement__state__in=services.WARD_PIPELINE_STATES,
    ).values_list("ward_id", "placement__planned_start", "placement__planned_end"):
        held[ward_id].append((start, end))

    mentor_state = {}
    # The same rule release enforces: when the programme does not require training, nobody is "untrained".
    training_required = actor.program.require_mentor_training_before_placement
    for mentor in identity.active_mentors(program_id=actor.program_id, facility_id=facility):
        accepting = mentor.accepting_students and mentor.status == identity.STATUSES.ACTIVE
        mentor_state[mentor.id] = {
            "user": mentor,
            "remaining": max(0, mentor.max_active_placements - mentor.active_placement_count) if accepting else 0,
            "planned": 0,
            "trained": (not training_required) or learning.required_modules_complete(mentor),
        }
    planned_per_ward = defaultdict(list)

    def ward_state(ward, start, end):
        taken = sum(1 for s, e in held[ward.id] if s <= end and e >= start) + sum(1 for s, e in planned_per_ward[ward.id] if s <= end and e >= start)
        return ward.max_students - taken, taken

    window_start = min((p.planned_start for p in candidates), default=None)
    window_end = max((p.planned_end for p in candidates), default=None)
    before = {w.id: (sum(1 for s, e in held[w.id] if s <= window_end and e >= window_start) if window_start else 0) for w in wards}

    placed, unplaced = [], []
    for placement in candidates:
        start, end = placement.planned_start, placement.planned_end
        usable = []
        for ward in wards:
            free, taken = ward_state(ward, start, end)
            if free > 0:
                usable.append((ward, free, taken))
        info = names.get(placement.id) or {}
        row = {
            "placement_id": str(placement.id), "student": info.get("name", "Student"), "registration_number": info.get("registration_number", ""),
            "cohort": placement.cohort.name, "window": [start.isoformat(), end.isoformat()], "ward": None, "mentor": None, "issues": [],
        }
        if not usable:
            unplaced.append({**row, "reason": "This facility has no active wards." if not wards else "Every ward is full for these dates."})
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

    facility_row = next(iter(facilities.active_facilities(program_id=actor.program_id, facility_ids=[facility])), None)
    return {
        "seed": seed, "strategy": strategy, "facility_id": str(facility), "facility_name": facility_row.name if facility_row else "",
        "plan_hash": _plan_hash(placed),
        "assignments": placed, "unplaced": unplaced,
        "summary": {
            "incoming": len(candidates), "arranged": len(placed), "unplaced": len(unplaced),
            "with_mentor": sum(1 for r in placed if r["mentor"]),
            "wards": [
                {"id": str(w.id), "name": w.name, "capacity": w.max_students, "before": before[w.id], "added": len(planned_per_ward[w.id]),
                 "after": before[w.id] + len(planned_per_ward[w.id])}
                for w in wards
            ],
            "mentors": [
                {"id": str(m["user"].id), "name": m["user"].full_name, "assigned": m["planned"], "remaining": m["remaining"] - m["planned"],
                 "limit": m["user"].max_active_placements, "trained": m["trained"]}
                for m in mentor_state.values() if m["planned"] or m["remaining"]
            ],
        },
    }


def _arrange_one(actor, facility, row):
    """Arrange one student under their own savepoint. Returns ``(arranged_row, None)`` or ``(None, reason)``.

    The placement is locked and re-checked first: if someone else (another manager, a coordinator withdrawing the
    request) got there between the plan and now, this student is left exactly as they are, never moved.
    """
    placement_id = UUID(row["placement_id"])
    try:
        with transaction.atomic():
            current = Placement.objects.select_for_update().filter(id=placement_id).first()
            if current is None or current.state != State.DRAFT or current.facility_id is not None or current.requested_facility_id != facility:
                return None, "Already arranged, or no longer requested of this facility, so it was left as it is."
            services.allocate_ward(placement_id, UUID(row["ward"]["id"]), actor=actor)
            out = dict(row)
            if row["mentor"]:
                try:
                    with transaction.atomic():
                        services.assign_mentor(placement_id, UUID(row["mentor"]["id"]), actor=actor)
                except errors.DomainError as exc:
                    # The ward place is real; only the mentor could not be given. Keep it and say so.
                    out["mentor"] = None
                    out["issues"] = [*row["issues"], f"Mentor could not be assigned ({exc.message}). Assign one manually to schedule this placement."]
            return out, None
    except errors.DomainError as exc:
        return None, exc.message
    except Exception:  # noqa: BLE001 - one student's unexpected failure must not abandon the other 59
        logger.exception("Unexpected failure arranging placement %s", placement_id)
        return None, "Could not be arranged because of an unexpected problem. Try this student again."


def apply_auto_arrange(*, actor, facility_id=None, placement_ids=None, strategy: str = "balanced", seed: str | None = None, assign_mentors: bool = True, expected_plan_hash: str | None = None) -> dict:
    plan = plan_auto_arrange(actor=actor, facility_id=facility_id, placement_ids=placement_ids, strategy=strategy, seed=seed, assign_mentors=assign_mentors)
    if expected_plan_hash and expected_plan_hash != plan["plan_hash"]:
        raise errors.InvalidTransition("Things changed since you reviewed this arrangement. Please review it again before confirming.")
    if not plan["assignments"] and not plan["unplaced"]:
        raise errors.InvalidTransition("Nobody is waiting to be arranged at this facility.")
    facility = UUID(plan["facility_id"])
    candidate_ids = [UUID(r["placement_id"]) for r in [*plan["assignments"], *plan["unplaced"]]]
    institution_of = dict(Placement.objects.filter(id__in=candidate_ids).values_list("id", "institution_id"))
    # Record the run first so a crash part-way leaves a trail (over HTTP the surrounding command transaction still decides).
    run = AllocationRun.objects.create(
        mode=AllocationRun.Mode.AUTO_ARRANGE, facility_id=facility, actor=actor, strategy=plan["strategy"], seed=plan["seed"],
        plan_hash=plan["plan_hash"], status="running", summary={"planned": len(plan["assignments"])},
        institution_ids=sorted({str(v) for v in institution_of.values()}),
    )
    done, failed = [], []
    per_mentor = defaultdict(int)
    with services.quiet_notifications():
        for row in plan["assignments"]:
            arranged, reason = _arrange_one(actor, facility, row)
            if arranged is None:
                failed.append({**row, "ward": None, "mentor": None, "reason": reason})
                continue
            done.append(arranged)
            if arranged["mentor"]:
                per_mentor[arranged["mentor"]["id"]] += 1
    unplaced = plan["unplaced"] + failed

    arranged_by_institution = defaultdict(int)
    unplaced_by_institution = defaultdict(int)
    for row in done:
        arranged_by_institution[institution_of[UUID(row["placement_id"])]] += 1
    for row in unplaced:
        unplaced_by_institution[institution_of[UUID(row["placement_id"])]] += 1
    with transaction.atomic():
        for mentor_id, count in per_mentor.items():
            outbox.publish(events.MentorPlacementsAssigned(mentor_id=UUID(mentor_id), count=count, recipient_user_ids=(UUID(mentor_id),)))
        for institution_id in sorted(set(arranged_by_institution) | set(unplaced_by_institution), key=str):
            coordinators = tuple(
                identity.users(role=identity.ROLES.COORDINATOR, status=identity.STATUSES.ACTIVE, institution_id=institution_id).values_list("id", flat=True)
            )
            outbox.publish(events.PlacementsArranged(
                facility_id=facility, arranged=arranged_by_institution[institution_id], unplaced=unplaced_by_institution[institution_id], recipient_user_ids=coordinators,
            ))
        if done:
            audit.record(
                actor=actor, action="placement.auto_arrange", entity_table="placements_placement", entity_id=UUID(done[0]["placement_id"]),
                scope={"program_id": str(actor.program_id), "facility_id": str(facility)},
                changes={"arranged": len(done), "unplaced": len(unplaced), "strategy": plan["strategy"], "seed": plan["seed"], "run_id": str(run.id)},
            )
    added = defaultdict(int)
    for row in done:
        added[row["ward"]["id"]] += 1
    wards_report = [
        {**w, "added": added.get(w["id"], 0), "after": w["before"] + added.get(w["id"], 0)} for w in plan["summary"]["wards"]
    ]
    mentor_names = {m["id"]: m for m in plan["summary"]["mentors"]}
    mentors_report = [
        {"id": mentor_id, "name": (mentor_names.get(mentor_id) or {}).get("name", ""), "assigned": count, "limit": (mentor_names.get(mentor_id) or {}).get("limit")}
        for mentor_id, count in per_mentor.items()
    ]
    result = {
        "run_id": str(run.id), "seed": plan["seed"], "strategy": plan["strategy"], "facility_id": str(facility), "arranged": done, "unplaced": unplaced,
        "summary": {
            "arranged": len(done), "unplaced": len(unplaced), "mentors_notified": len(per_mentor),
            "with_mentor": sum(1 for r in done if r["mentor"]), "without_mentor": sum(1 for r in done if not r["mentor"]),
        },
        "wards": wards_report, "mentors": mentors_report,
    }
    run.status = "completed" if not unplaced else ("partial" if done else "failed")
    run.summary = {**result["summary"], "planned": len(plan["assignments"])}
    run.result = result
    run.save(update_fields=["status", "summary", "result", "updated_at"])
    return result


UNDO_WINDOW = dt.timedelta(hours=24)


def runs_for(*, actor, limit: int = 8, mode: str | None = None):
    """Recent allocation runs the actor may see, newest first.

    Nurse managers see their facility's arrangements; coordinators see the arrangements and facility requests that
    concern their institution (read-only: ``can_undo``/``can_retry`` are false); programme admins see the programme's.
    """
    from django.db.models import Q

    if actor.role == identity.ROLES.COORDINATOR:
        identity.require_capability(actor, "request_facility")
        rows = AllocationRun.objects.filter(Q(institution_id=actor.institution_id) | Q(institution_ids__contains=[str(actor.institution_id)]))
        can_act = False
    else:
        identity.require_capability(actor, "arrange_placements")
        rows = AllocationRun.objects.filter(mode=AllocationRun.Mode.AUTO_ARRANGE)
        if actor.role != identity.ROLES.PROGRAM_ADMIN:
            rows = rows.filter(facility_id=actor.facility_id)
        else:
            rows = rows.filter(facility__program_id=actor.program_id)
        can_act = True
    if mode:
        rows = rows.filter(mode=mode)
    rows = rows.select_related("actor", "facility").order_by("-created_at")
    page = list(rows[:limit])
    mine = None
    if actor.role == identity.ROLES.COORDINATOR:
        # A facility's arrangement can include other schools' students: a coordinator is only told about their own.
        wanted = [r["placement_id"] for run in page for key in ("arranged", "unplaced", "assignments") for r in (run.result or {}).get(key, []) if r.get("placement_id")]
        mine = {str(pid) for pid in Placement.objects.filter(id__in=wanted, institution_id=actor.institution_id).values_list("id", flat=True)}

    def own(run, key):
        return sum(1 for r in (run.result or {}).get(key, []) if r.get("placement_id") in mine)

    out = []
    for run in page:
        undoable = can_act and run.status in {"completed", "partial"} and timezone.now() - run.created_at <= UNDO_WINDOW
        arranged = run.summary.get("arranged", 0)
        requested = run.summary.get("requested")
        if mine is not None:
            arranged = own(run, "arranged")
            if run.mode == AllocationRun.Mode.FACILITY_SPLIT:
                requested = {"mine": own(run, "assignments")}
        out.append({
            "id": str(run.id), "mode": run.mode, "created_at": run.created_at, "by": run.actor.full_name, "strategy": run.strategy, "status": run.status,
            "facility_id": str(run.facility_id) if run.facility_id else None, "facility_name": run.facility.name if run.facility_id else None,
            "arranged": arranged, "unplaced": own(run, "unplaced") if mine is not None and run.mode == AllocationRun.Mode.AUTO_ARRANGE else run.summary.get("unplaced", 0),
            "requested": sum(requested.values()) if isinstance(requested, dict) else None,
            "can_undo": undoable,
            "can_retry": can_act and run.status in {"partial", "failed"} and bool(run.result.get("unplaced")) and not run.summary.get("retried_by"),
        })
    return out


def _run_for_actor(actor, run_id) -> AllocationRun:
    identity.require_capability(actor, "arrange_placements")
    run = AllocationRun.objects.select_for_update().filter(id=run_id, mode=AllocationRun.Mode.AUTO_ARRANGE).first()
    if run is None or (actor.role != identity.ROLES.PROGRAM_ADMIN and run.facility_id != actor.facility_id):
        raise errors.UnauthorizedFacilityAccess()
    if actor.role == identity.ROLES.PROGRAM_ADMIN and run.facility.program_id != actor.program_id:
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
    result = apply_auto_arrange(actor=actor, facility_id=facility, placement_ids=ids, strategy=strategy)
    # Remember that this run has been retried, so the same list is not offered again.
    AllocationRun.objects.filter(id=run_id).update(summary={**run.summary, "retried_by": result["run_id"]})
    return result


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
        placement.requested_at = None
        placement.save(update_fields=["declined_facility", "decline_reason", "declined_at", "requested_facility", "requested_at", "updated_at"])
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
            **({"institution__program_id": actor.program_id} if actor.role == identity.ROLES.PROGRAM_ADMIN else {"institution_id": actor.institution_id}),
        )
    )
    if not rows:
        raise errors.InvalidTransition("Only requests that the facility has not yet acted on can be withdrawn.")
    by_facility = defaultdict(int)
    for placement in rows:
        by_facility[placement.requested_facility_id] += 1
        placement.requested_facility_id = None
        placement.requested_at = None
        placement.save(update_fields=["requested_facility", "requested_at", "updated_at"])
    for facility_id, count in by_facility.items():
        managers = tuple(identity.users(role=identity.ROLES.NURSE_MANAGER, status=identity.STATUSES.ACTIVE, facility_id=facility_id).values_list("id", flat=True))
        outbox.publish(events.PlacementRequestsWithdrawn(facility_id=facility_id, count=count, recipient_user_ids=managers))
    audit.record(actor=actor, action="placement.requests_withdrawn", entity_table="placements_placement", entity_id=rows[0].id,
                 scope={"program_id": str(actor.program_id)}, changes={"count": len(rows)})
    return {"withdrawn": len(rows)}
