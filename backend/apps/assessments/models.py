"""Assessments and feedback.

Two feedback tables, not one with a nullable placement (ADR 0008): a table with
no re-identifying column cannot leak through a forgotten WHERE clause.
"""

from django.db import models

from apps.core.models import BaseModel, new_id


class AssessmentKind(models.TextChoices):
    BASELINE_CONFIDENCE = "baseline_confidence", "Baseline confidence"
    FINAL_CONFIDENCE = "final_confidence", "Final confidence"
    EXIT_SURVEY = "exit_survey", "Exit survey"


class Assessment(BaseModel):
    placement = models.ForeignKey("placements.Placement", on_delete=models.PROTECT, related_name="assessments")
    kind = models.CharField(max_length=32, choices=AssessmentKind.choices)
    submitted_at = models.DateTimeField(auto_now_add=True)
    revises = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="revisions"
    )

    class Meta:
        db_table = "assessments_assessment"
        indexes = [models.Index(fields=["placement", "kind"])]


class FeedbackConfidential(BaseModel):
    """Placement-linked. Restricted read (POL-014)."""

    placement = models.ForeignKey("placements.Placement", on_delete=models.PROTECT, related_name="feedback")
    submitted_at = models.DateTimeField(auto_now_add=True)
    unresolved_concern = models.BooleanField(default=False)
    comments = models.TextField(null=True, blank=True)
    revises = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="revisions"
    )

    class Meta:
        db_table = "assessments_feedback_confidential"


class FeedbackAnonymous(models.Model):
    """No placement, no student — there is no column to re-identify through.

    A placement identifies exactly one student, so anonymous feedback linked to a
    placement is not anonymous (POL-014, ADR 0008). `submitted_on` is a date
    rather than a timestamp: an exact time plus application logs would correlate
    the row back to a session.
    """

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    cohort = models.ForeignKey("institutions.Cohort", on_delete=models.PROTECT, related_name="anonymous_feedback")
    facility = models.ForeignKey("facilities.Facility", on_delete=models.PROTECT, related_name="anonymous_feedback")
    ward = models.ForeignKey("facilities.Ward", on_delete=models.PROTECT, related_name="anonymous_feedback")
    submitted_on = models.DateField()

    class Meta:
        db_table = "assessments_feedback_anonymous"


class Response(BaseModel):
    """Scores as rows, so a new survey instrument is data, not a migration."""

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)

    class Scale(models.TextChoices):
        LIKERT_1_5 = "likert_1_5", "Likert 1-5"
        SCORE_0_100 = "score_0_100", "Score 0-100"
        YES_NO = "yes_no", "Yes/No"

    assessment = models.ForeignKey(
        Assessment, on_delete=models.PROTECT, null=True, blank=True, related_name="responses"
    )
    feedback_confidential = models.ForeignKey(
        FeedbackConfidential, on_delete=models.PROTECT, null=True, blank=True, related_name="responses"
    )
    question_code = models.CharField(max_length=60)
    scale = models.CharField(max_length=20, choices=Scale.choices)
    value_numeric = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    value_boolean = models.BooleanField(null=True, blank=True)

    class Meta:
        db_table = "assessments_response"
        constraints = [
            # INV-15: ranges enforced per scale, at the database.
            models.CheckConstraint(
                check=(
                    models.Q(scale="likert_1_5", value_numeric__gte=1, value_numeric__lte=5)
                    | models.Q(scale="score_0_100", value_numeric__gte=0, value_numeric__lte=100)
                    | models.Q(scale="yes_no", value_numeric=None, value_boolean__isnull=False)
                ),
                name="assessment_score_in_range",
            ),
        ]


class AnonymousResponse(models.Model):
    """Timestamp-free rating row owned only by an anonymous group submission."""

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    feedback_anonymous = models.ForeignKey(
        FeedbackAnonymous, on_delete=models.PROTECT, related_name="responses"
    )
    question_code = models.CharField(max_length=60)
    scale = models.CharField(max_length=20, choices=Response.Scale.choices)
    value_numeric = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    value_boolean = models.BooleanField(null=True, blank=True)

    class Meta:
        db_table = "assessments_anonymous_response"
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(scale="likert_1_5", value_numeric__gte=1, value_numeric__lte=5)
                    | models.Q(scale="score_0_100", value_numeric__gte=0, value_numeric__lte=100)
                    | models.Q(scale="yes_no", value_numeric=None, value_boolean__isnull=False)
                ),
                name="anonymous_assessment_score_in_range",
            ),
        ]


class AnonymousFeedbackCommand(models.Model):
    """Date-only, keyed-digest replay guard with no actor or result reference."""

    command_digest = models.CharField(max_length=64, primary_key=True)
    payload_digest = models.CharField(max_length=64, blank=True, default="")
    received_on = models.DateField()

    class Meta:
        db_table = "assessments_anonymous_feedback_command"


class AnonymousFeedbackAuditDay(models.Model):
    """Daily system-wide count; deliberately has no actor, scope, or row link."""

    submitted_on = models.DateField(primary_key=True)
    submissions = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "assessments_anonymous_feedback_audit_day"
