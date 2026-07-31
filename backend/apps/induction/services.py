"""Induction commands.

`sign_induction` is the TX-03 case (Stage 4 §8.1): completing the checklist also
activates the placement, in one transaction. The guard's data travels with the
request — induction owns the checklist, so induction evaluates INV-02, and
`placements` still owns the transition table and refuses ACTIVATE from any state
other than INDUCTION. Neither module trusts the other about anything it does not
own.
"""

from __future__ import annotations

from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.core import audit, errors, outbox
from apps.induction import events
from apps.induction.models import Checklist, ChecklistTemplate, ItemResponse, TemplateItem
from apps.placements import api as placements

TABLE = "induction_checklist"


def open_induction(placement_id: UUID, *, actor, override_reason: str | None = None) -> Checklist:
    template = ChecklistTemplate.objects.filter(
        published_at__isnull=False, retired_at=None
    ).order_by("-version").first()
    if template is None:
        raise errors.InvalidTransition("No published induction checklist template exists.")

    with transaction.atomic():
        placements.request_transition(
            placement_id, "induction", actor=actor, reason=override_reason,
            asserted_by="induction.open_induction",
        )
        checklist = Checklist.objects.create(
            placement_id=placement_id, template=template
        )
        audit.record(actor=actor, action="induction.open", entity_table=TABLE, entity_id=checklist.id,
                     override_reason=override_reason)
        outbox.publish(events.InductionOpened(placement_id=placement_id, checklist_id=checklist.id))
    return checklist


def answer_item(checklist_id: UUID, template_item_id: UUID, response: str, *, actor,
                comment: str | None = None) -> ItemResponse:
    with transaction.atomic():
        checklist = _lock(checklist_id)
        # INV-06: items are writable only while the placement is in induction.
        if placements.state_of(checklist.placement_id) != "induction":
            raise errors.InvalidTransition("The induction checklist is not open.")
        row, _ = ItemResponse.objects.update_or_create(
            checklist=checklist, template_item_id=template_item_id,
            defaults={"response": response, "comment": comment, "answered_by": actor},
        )
        audit.record(actor=actor, action="induction.answer_item", entity_table="induction_item_response",
                     entity_id=row.id)
        outbox.publish(events.ChecklistItemCompleted(
            checklist_id=checklist.id, template_item_id=template_item_id
        ))
    return row


def sign_induction(checklist_id: UUID, *, actor) -> Checklist:
    """TX-03: the final answer, the checklist status, and activation commit together."""
    with transaction.atomic():
        checklist = _lock(checklist_id)
        if checklist.completed_at is not None:
            # Idempotent: a second signature is not an error, the placement is active.
            return checklist

        required = set(
            TemplateItem.objects.filter(template=checklist.template, is_required=True)
            .values_list("id", flat=True)
        )
        answered = set(
            ItemResponse.objects.filter(checklist=checklist, template_item_id__in=required)
            .values_list("template_item_id", flat=True)
        )
        outstanding = required - answered
        if outstanding:
            raise errors.InductionIncomplete(outstanding=len(outstanding))   # INV-02

        checklist.completed_at = timezone.now()
        checklist.signed_by = actor
        checklist.save(update_fields=["completed_at", "signed_by", "updated_at"])

        # Downward call into layer 2, same transaction (Stage 4 §8.1).
        placements.request_transition(
            checklist.placement_id, "active", actor=actor, asserted_by="induction.sign_induction"
        )
        audit.record(actor=actor, action="induction.sign", entity_table=TABLE, entity_id=checklist.id)
        outbox.publish(events.InductionCompleted(
            placement_id=checklist.placement_id, checklist_id=checklist.id
        ))
    return checklist


def _lock(checklist_id: UUID) -> Checklist:
    checklist = Checklist.objects.select_for_update().filter(id=checklist_id).first()
    if checklist is None:
        raise errors.UnauthorizedFacilityAccess()
    return checklist
