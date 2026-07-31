"""Induction: versioned templates, one checklist per placement."""

from django.db import models

from apps.core.models import BaseModel


class ChecklistTemplate(BaseModel):
    program = models.ForeignKey("identity.Program", on_delete=models.PROTECT, related_name="checklist_templates")
    version = models.IntegerField()
    published_at = models.DateTimeField(null=True, blank=True)
    retired_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "induction_checklist_template"
        constraints = [
            models.UniqueConstraint(fields=["program", "version"], name="one_template_version_per_program")
        ]


class TemplateItem(BaseModel):
    template = models.ForeignKey(ChecklistTemplate, on_delete=models.PROTECT, related_name="items")
    position = models.SmallIntegerField()
    label = models.TextField()
    is_required = models.BooleanField(default=True)
    completed_by_role = models.CharField(max_length=32, default="mentor")

    class Meta:
        db_table = "induction_template_item"
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(fields=["template", "position"], name="one_item_per_position")
        ]


class Checklist(BaseModel):
    """One per placement, permanently — which is what "induction survives mentor
    reassignment" means in schema terms (Stage 3.5 §5.3)."""

    placement = models.OneToOneField(
        "placements.Placement", on_delete=models.PROTECT, related_name="induction_checklist"
    )
    # Pinned at instantiation so a published template edit cannot change what a
    # mentor already signed (Stage 3.5 §6.3).
    template = models.ForeignKey(ChecklistTemplate, on_delete=models.PROTECT, related_name="checklists")
    opened_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    signed_by = models.ForeignKey(
        "identity.User", on_delete=models.PROTECT, null=True, blank=True, related_name="signed_checklists"
    )

    class Meta:
        db_table = "induction_checklist"
        constraints = [
            models.CheckConstraint(
                check=models.Q(completed_at=None) | ~models.Q(signed_by=None),
                name="checklist_completed_needs_signature",
            )
        ]


class ItemResponse(BaseModel):
    class Answer(models.TextChoices):
        YES = "yes", "Yes"
        NO = "no", "No"
        NOT_APPLICABLE = "not_applicable", "Not applicable"

    checklist = models.ForeignKey(Checklist, on_delete=models.PROTECT, related_name="responses")
    template_item = models.ForeignKey(TemplateItem, on_delete=models.PROTECT, related_name="responses")
    response = models.CharField(max_length=20, choices=Answer.choices)
    comment = models.TextField(null=True, blank=True)
    answered_at = models.DateTimeField(auto_now_add=True)
    answered_by = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "induction_item_response"
        constraints = [
            models.UniqueConstraint(fields=["checklist", "template_item"], name="one_response_per_item")
        ]
