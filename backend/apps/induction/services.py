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

from django.db import models, transaction
from django.utils import timezone

from apps.core import audit, errors, outbox
from apps.induction import events
from apps.induction.models import (
    Checklist, ChecklistTemplate, InductionBatch, InductionBatchResult,
    ItemResponse, OrientationAcknowledgement, TemplateItem,
)
from apps.placements import api as placements
from apps.identity import api as identity

TABLE = "induction_checklist"


@transaction.atomic
def acknowledge_orientation(placement_id: UUID, *, actor, **data) -> OrientationAcknowledgement:
    placement = placements.assert_access(placement_id, actor=actor)
    identity.require_capability(actor, "confirm_placement")
    if placements.state_of(placement_id) != "orientation":
        raise errors.InvalidTransition("Orientation is not available for this placement.")
    assignment = placement.student_assignments.filter(student_id=actor.id, ended_at=None).exists()
    if not assignment:
        raise errors.UnauthorizedFacilityAccess()
    acknowledgement, created = OrientationAcknowledgement.objects.get_or_create(
        placement_id=placement_id, defaults={"student": actor, **data}
    )
    if created:
        audit.record(actor=actor, action="orientation.acknowledged", entity_table="induction_orientation_acknowledgement", entity_id=acknowledgement.id)
        mentor_ids = placements.notification_recipients(placement_id, role="mentor")
        outbox.publish(events.OrientationAcknowledged(
            placement_id=placement_id, acknowledgement_id=acknowledgement.id,
            recipient_user_ids=mentor_ids,
        ))
    return acknowledgement


def open_induction(placement_id: UUID, *, actor, override_reason: str | None = None) -> Checklist:
    template = ChecklistTemplate.objects.filter(
        program_id=actor.program_id, published_at__isnull=False, retired_at=None
    ).order_by("-version").first()
    if template is None:
        raise errors.InvalidTransition("No published induction checklist template exists.")

    with transaction.atomic():
        if not OrientationAcknowledgement.objects.filter(placement_id=placement_id).exists() and not override_reason:
            raise errors.OrientationIncomplete()
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
        placements.assert_access(checklist.placement_id, actor=actor)
        identity.require_capability(actor, "open_induction")
        # INV-06: items are writable only while the placement is in induction.
        if placements.state_of(checklist.placement_id) != "induction":
            raise errors.InvalidTransition("The induction checklist is not open.")
        item = TemplateItem.objects.filter(id=template_item_id, template_id=checklist.template_id).first()
        if item is None:
            raise errors.UnauthorizedFacilityAccess()
        if item.response_kind == "scheduled_date" and response == "yes" and not (comment or "").strip():
            raise errors.SessionValidationFailed(
                "Add the agreed date and time before marking this as done.", fields={"comment": "date and time required"},
            )
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
        placements.assert_access(checklist.placement_id, actor=actor)
        identity.require_capability(actor, "open_induction")
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
            placement_id=checklist.placement_id, checklist_id=checklist.id,
            recipient_user_ids=placements.notification_recipients(checklist.placement_id, role="student"),
        ))
    return checklist


@transaction.atomic
def open_induction_batch(placement_ids: tuple[UUID, ...], *, actor) -> InductionBatch:
    """Open or join same-template checklists for a mentor-led student group."""
    identity.require_capability(actor, "open_induction")
    if not placement_ids or len(placement_ids) > 100 or len(set(placement_ids)) != len(placement_ids):
        raise errors.SessionValidationFailed(fields={"placement_ids": "choose 1–100 different students"})
    current_template = ChecklistTemplate.objects.filter(
        program_id=actor.program_id, published_at__isnull=False, retired_at=None,
    ).order_by("-version").first()

    prepared = []
    template = None
    for placement_id in sorted(placement_ids, key=str):
        placement = placements.assert_access(placement_id, actor=actor)
        if placement.state == "orientation":
            if not OrientationAcknowledgement.objects.filter(placement_id=placement_id).exists():
                raise errors.OrientationIncomplete()
            if current_template is None:
                raise errors.InvalidTransition("No published induction checklist template exists.")
            checklist = None
            placement_template = current_template
        elif placement.state == "induction":
            checklist = Checklist.objects.filter(placement_id=placement_id).first()
            if checklist is None:
                raise errors.InvalidTransition("The induction checklist is unavailable for a selected student.")
            placement_template = checklist.template
        else:
            raise errors.InvalidTransition("Select students who are waiting for or completing induction.")
        if template is None:
            template = placement_template
        elif placement_template.id != template.id:
            raise errors.InvalidTransition("Selected students have different checklist versions. Group matching versions together.")
        prepared.append((placement_id, checklist))

    if template is None:
        raise errors.InvalidTransition("No induction checklist is available for the selected students.")

    batch = InductionBatch.objects.create(template=template, created_by=actor)
    for placement_id, checklist in prepared:
        if checklist is None:
            checklist = open_induction(placement_id, actor=actor)
        InductionBatchResult.objects.create(
            batch=batch, placement_id=placement_id, checklist=checklist,
        )
    audit.record(actor=actor, action="induction.batch_open", entity_table="induction_batch",
                 entity_id=batch.id, changes={"selected_count": len(prepared), "template_version": template.version})
    return batch


@transaction.atomic
def answer_induction_batch_item(batch_id: UUID, template_item_id: UUID, response: str, *, actor,
                                comment: str | None = None) -> InductionBatch:
    batch = InductionBatch.objects.select_for_update().filter(id=batch_id).first()
    if batch is None:
        raise errors.UnauthorizedFacilityAccess()
    identity.require_capability(actor, "open_induction")
    if not TemplateItem.objects.filter(id=template_item_id, template_id=batch.template_id).exists():
        raise errors.UnauthorizedFacilityAccess()
    results = list(batch.results.select_related("checklist").order_by("placement_id"))
    for result in results:
        placements.assert_access(result.placement_id, actor=actor)
        if result.checklist.completed_at is not None:
            raise errors.InvalidTransition("A signed checklist in this group can no longer be changed.")
        answer_item(result.checklist_id, template_item_id, response, actor=actor, comment=comment)
    audit.record(actor=actor, action="induction.batch_answer", entity_table="induction_batch",
                 entity_id=batch.id, changes={"template_item_id": str(template_item_id),
                                             "response": response, "selected_count": len(results)})
    return batch


@transaction.atomic
def sign_induction_batch(batch_id: UUID, *, actor) -> InductionBatch:
    batch = InductionBatch.objects.select_for_update().filter(id=batch_id).first()
    if batch is None:
        raise errors.UnauthorizedFacilityAccess()
    identity.require_capability(actor, "open_induction")
    results = list(batch.results.order_by("placement_id"))
    if not results:
        raise errors.InvalidTransition("This induction group has no students.")
    for result in results:
        placements.assert_access(result.placement_id, actor=actor)
        sign_induction(result.checklist_id, actor=actor)
    audit.record(actor=actor, action="induction.batch_sign", entity_table="induction_batch",
                 entity_id=batch.id, changes={"selected_count": len(results)})
    return batch


def _lock(checklist_id: UUID) -> Checklist:
    checklist = Checklist.objects.select_for_update().filter(id=checklist_id).first()
    if checklist is None:
        raise errors.UnauthorizedFacilityAccess()
    return checklist


#: Default labour-ward induction checklist from the MentorMAMA concept note (section 11).
#: (label, completed_by_role). Roles: mentor, mentor_or_nurse_manager, mentor_and_student.
DEFAULT_CHECKLIST_ITEMS: tuple[tuple[str, str], ...] = (
    ("Student welcomed and introduced to the ward/unit team.", "mentor_or_nurse_manager"),
    ("Student shown ward layout, emergency exits, handwashing points, PPE area and staff room.", "mentor"),
    ("Student oriented to shift times, reporting lines and who to contact for support.", "mentor"),
    ("Student briefed on respectful maternity care expectations.", "mentor"),
    ("Student briefed on documentation expectations and confidentiality.", "mentor"),
    ("Student briefed on emergency escalation protocols.", "mentor_or_nurse_manager"),
    ("Student learning objectives discussed and recorded.", "mentor_and_student"),
    ("First mentorship session scheduled. Add the agreed date and time in the comment.", "mentor_and_student"),
)


def ensure_default_template(program) -> tuple[ChecklistTemplate, bool]:
    """Publish the concept-note checklist for a programme that has none yet.

    Idempotent: a programme that already has a published template is left alone,
    so a customised checklist is never overwritten.
    """
    existing = ChecklistTemplate.objects.filter(
        program=program, published_at__isnull=False, retired_at__isnull=True
    ).order_by("-version").first()
    if existing is not None:
        return existing, False
    with transaction.atomic():
        version = (
            ChecklistTemplate.objects.filter(program=program).aggregate(top=models.Max("version"))["top"] or 0
        ) + 1
        template = ChecklistTemplate.objects.create(program=program, version=version, published_at=timezone.now())
        for position, (label, role) in enumerate(DEFAULT_CHECKLIST_ITEMS, start=1):
            TemplateItem.objects.create(template=template, position=position, label=label, completed_by_role=role)
    return template, True
