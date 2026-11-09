"""Disposable analytics projections.

These models intentionally have no foreign keys into domain tables. The
materialized views are rebuildable from authoritative domain data and are not
used by any workflow invariant.
"""

from django.db import models

from apps.core.models import BaseModel


class InterruptionCause(models.Model):
    program_id = models.UUIDField()
    institution_id = models.UUIDField()
    facility_id = models.UUIDField()
    facility_name = models.CharField(max_length=200)
    cohort_id = models.UUIDField()
    cohort_name = models.CharField(max_length=200)
    reason = models.CharField(max_length=40)
    interruptions = models.IntegerField()
    days_interrupted = models.IntegerField()

    class Meta:
        managed = False
        db_table = "analytics_interruption_causes"
        unique_together = (("facility_id", "cohort_id", "reason"),)


class FacilityIndicator(models.Model):
    program_id = models.UUIDField()
    facility_id = models.UUIDField()
    facility_name = models.CharField(max_length=200)
    placements_total = models.IntegerField()
    placements_active = models.IntegerField()
    placements_awaiting_student = models.IntegerField()
    placements_induction = models.IntegerField()
    placements_completed = models.IntegerField()
    sessions_total = models.IntegerField()

    class Meta:
        managed = False
        db_table = "analytics_facility_indicators"


class CohortIndicator(models.Model):
    program_id = models.UUIDField()
    institution_id = models.UUIDField()
    cohort_id = models.UUIDField()
    cohort_name = models.CharField(max_length=200)
    placements_total = models.IntegerField()
    placements_active = models.IntegerField()
    placements_awaiting_student = models.IntegerField()
    placements_induction = models.IntegerField()
    placements_completed = models.IntegerField()
    sessions_total = models.IntegerField()

    class Meta:
        managed = False
        db_table = "analytics_cohort_indicators"


class FeedbackAggregate(models.Model):
    mentor_id = models.UUIDField()
    question_code = models.CharField(max_length=60)
    responses = models.IntegerField()
    mean_score = models.DecimalField(max_digits=5, decimal_places=2, null=True)

    class Meta:
        managed = False
        db_table = "analytics_feedback_aggregate"
        unique_together = (("mentor_id", "question_code"),)


class AnonymousFeedbackAggregate(models.Model):
    """Only group-level metrics meeting the minimum anonymous sample size."""

    id = models.UUIDField(primary_key=True)
    program_id = models.UUIDField()
    institution_id = models.UUIDField()
    cohort_id = models.UUIDField()
    cohort_name = models.CharField(max_length=200)
    facility_id = models.UUIDField()
    facility_name = models.CharField(max_length=200)
    ward_id = models.UUIDField()
    ward_name = models.CharField(max_length=200)
    metric_kind = models.CharField(max_length=16)
    question_code = models.CharField(max_length=60)
    scale = models.CharField(max_length=20, null=True)
    submissions = models.IntegerField()
    responses = models.IntegerField()
    mean_score = models.DecimalField(max_digits=6, decimal_places=2, null=True)

    class Meta:
        managed = False
        db_table = "analytics_anonymous_feedback_aggregate"


class ExportRecord(BaseModel):
    """Audited export job and its short-lived local storage handle."""

    STATUS_CHOICES = [(value, value) for value in ("queued", "running", "completed", "failed")]
    actor_id = models.UUIDField()
    export_type = models.CharField(max_length=32)
    scope = models.JSONField(default=dict)
    filters = models.JSONField(default=dict)
    format = models.CharField(max_length=10, default="csv")
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="queued")
    row_count = models.IntegerField(default=0)
    storage_key = models.CharField(max_length=255, blank=True, default="")
    error_code = models.CharField(max_length=64, blank=True, default="")
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "analytics_export_record"
        indexes = [models.Index(fields=["actor_id", "-created_at"])]
