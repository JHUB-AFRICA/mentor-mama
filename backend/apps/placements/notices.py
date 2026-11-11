"""Early notice: tell students where they are placed before release, and remind everyone before a placement starts."""

from __future__ import annotations

import datetime as dt
import hashlib

from django.db import transaction
from django.utils import timezone

from apps.core import audit, outbox
from apps.identity import api as identity
from apps.placements import events, selectors
from apps.placements.models import MentorAssignment, Placement, State, StudentAssignment, WardAssignment

SHAREABLE_STATES = [State.DRAFT, State.SCHEDULED]
LEAD_DAYS = (14, 3)


def _fingerprint(placement, ward_row, mentor_row) -> str:
    parts = [str(placement.facility_id), str(ward_row.ward_id), str(mentor_row.mentor_id) if mentor_row else "-", str(placement.planned_start), str(placement.planned_end)]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


@transaction.atomic
def share_with_students(*, actor, placement_ids=None, cohort_id=None) -> dict:
    """Email each arranged student where they are placed. Safe to repeat: only changes are re-sent."""
    identity.require_capability(actor, "share_allocation")
    rows = selectors.in_scope(identity.resolve_scope(actor)).filter(state__in=SHAREABLE_STATES).select_for_update(of=("self",))
    if placement_ids:
        rows = rows.filter(id__in=placement_ids)
    if cohort_id:
        rows = rows.filter(cohort_id=cohort_id)
    sent = updated = unchanged = not_arranged = 0
    for placement in rows:
        ward_row = WardAssignment.objects.filter(placement=placement, ended_at=None).first()
        student_row = StudentAssignment.objects.filter(placement=placement, ended_at=None).first()
        if not ward_row or not placement.facility_id or not student_row:
            not_arranged += 1
            continue
        mentor_row = MentorAssignment.objects.filter(placement=placement, ended_at=None).first()
        digest = _fingerprint(placement, ward_row, mentor_row)
        if digest == placement.provisional_notice_hash:
            unchanged += 1
            continue
        is_update = bool(placement.provisional_notice_hash)
        outbox.publish(events.PlacementProvisionalNotice(placement_id=placement.id, update=is_update, recipient_user_ids=(student_row.student_id,)))
        placement.provisional_notice_hash = digest
        placement.provisional_notice_at = timezone.now()
        placement.save(update_fields=["provisional_notice_hash", "provisional_notice_at", "updated_at"])
        updated += 1 if is_update else 0
        sent += 0 if is_update else 1
    audit.record(actor=actor, action="placement.share_allocation", entity_table="placements_placement", entity_id=actor.id,
                 scope={"program_id": str(actor.program_id)}, changes={"sent": sent, "updated": updated})
    return {"sent": sent, "updated": updated, "unchanged": unchanged, "not_arranged": not_arranged}


def send_lead_reminders(*, today: dt.date | None = None) -> int:
    """Remind the student and mentor shortly before a placement starts (14 and 3 days out). Each reminder goes once."""
    today = today or timezone.localdate()
    sent = 0
    for days in LEAD_DAYS:
        key = f"d{days}"
        candidates = Placement.objects.filter(
            planned_start=today + dt.timedelta(days=days),
            state__in=[State.SCHEDULED, State.AWAITING_STUDENT, State.ORIENTATION],
        )
        for placement in candidates:
            if key in (placement.lead_reminders or []):
                continue
            recipients = [r.student_id for r in StudentAssignment.objects.filter(placement=placement, ended_at=None)]
            recipients += [r.mentor_id for r in MentorAssignment.objects.filter(placement=placement, ended_at=None)]
            if not recipients:
                continue
            with transaction.atomic():
                outbox.publish(events.PlacementStartsSoon(placement_id=placement.id, days=days, recipient_user_ids=tuple(recipients)))
                placement.lead_reminders = [*(placement.lead_reminders or []), key]
                placement.save(update_fields=["lead_reminders", "updated_at"])
            sent += 1
    return sent
