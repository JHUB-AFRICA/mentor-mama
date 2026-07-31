"""Safeguarding: escalations and their independent lifecycle (Stage 3 §5.3)."""

from django.db import models

from apps.core.models import BaseModel


class EscalationState(models.TextChoices):
    OPEN = "open", "Open"
    UNDER_REVIEW = "under_review", "Under review"
    ACTION_REQUIRED = "action_required", "Action required"
    RESOLVED = "resolved", "Resolved"
    CLOSED = "closed", "Closed"


class Severity(models.TextChoices):
    LOW = "low", "Low"
    MEDIUM = "medium", "Medium"
    HIGH = "high", "High"


class Escalation(BaseModel):
    placement = models.ForeignKey(
        "placements.Placement", on_delete=models.PROTECT, null=True, blank=True, related_name="escalations"
    )
    facility = models.ForeignKey("facilities.Facility", on_delete=models.PROTECT, related_name="escalations")
    submitted_by = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="raised_escalations")
    category = models.CharField(max_length=60)
    severity = models.CharField(max_length=10, choices=Severity.choices)
    # RESTRICTED (INV-13): never in a list response, event payload, export or log.
    description = models.TextField()
    state = models.CharField(max_length=20, choices=EscalationState.choices, default=EscalationState.OPEN)
    reviewer = models.ForeignKey(
        "identity.User", on_delete=models.PROTECT, null=True, blank=True, related_name="reviewed_escalations"
    )
    finding = models.TextField(null=True, blank=True)          # RESTRICTED
    action_taken = models.TextField(null=True, blank=True)     # RESTRICTED
    closure_date = models.DateField(null=True, blank=True)
    related_escalation = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="recurrences"
    )

    class Meta:
        db_table = "safeguarding_escalation"
        indexes = [
            models.Index(
                fields=["facility", "severity"],
                condition=~models.Q(state="closed"),
                name="escalation_open_idx",
            )
        ]
        constraints = [
            # WFR-008: the subject of a concern may not review it.
            models.CheckConstraint(
                check=models.Q(reviewer=None) | ~models.Q(reviewer=models.F("submitted_by")),
                name="reviewer_is_not_submitter",
            ),
            # E-02: leaving 'open' requires a reviewer.
            models.CheckConstraint(
                check=models.Q(state="open") | ~models.Q(reviewer=None),
                name="non_open_needs_reviewer",
            ),
            # E-04/E-05: resolution requires documented action.
            models.CheckConstraint(
                check=~models.Q(state__in=["resolved", "closed"]) | ~models.Q(action_taken=None),
                name="resolved_needs_action",
            ),
            # E-06: closure requires a date.
            models.CheckConstraint(
                check=~models.Q(state="closed") | ~models.Q(closure_date=None),
                name="closed_needs_date",
            ),
        ]
