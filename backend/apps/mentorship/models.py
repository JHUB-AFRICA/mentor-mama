"""Mentorship sessions.

A session references the mentor *assignment*, not the mentor. That single choice
satisfies INV-03 and WFR-011 structurally: the entry is attributable to whoever
held the role at the time, and stays correctly attributed after reassignment
with no historical rewrite.
"""

from django.db import models

from apps.core.models import BaseModel


class SessionType(models.TextChoices):
    ORIENTATION = "orientation", "Orientation"
    BEDSIDE_TEACHING = "bedside_teaching", "Bedside teaching"
    SKILLS_DISCUSSION = "skills_discussion", "Skills discussion"
    DEBRIEF = "debrief", "Debrief"
    FEEDBACK = "feedback", "Feedback"
    CASE_REFLECTION = "case_reflection", "Case reflection"
    OTHER = "other", "Other"


class Session(BaseModel):
    placement = models.ForeignKey("placements.Placement", on_delete=models.PROTECT, related_name="sessions")
    mentor_assignment = models.ForeignKey(
        "placements.MentorAssignment", on_delete=models.PROTECT, related_name="sessions"
    )
    session_date = models.DateField()
    session_type = models.CharField(max_length=32, choices=SessionType.choices)
    duration_minutes = models.SmallIntegerField(null=True, blank=True)
    # Restricted from the university side (POL-016).
    what_was_covered = models.TextField(null=True, blank=True)
    feedback_given = models.TextField(null=True, blank=True)
    follow_up_action = models.CharField(max_length=120, blank=True, default="")
    submitted_at = models.DateTimeField(auto_now_add=True)
    # WFR-014's five-minute window, as an indexable value.
    #
    # Stage 5 §5.4 specified a functional index over `date_trunc('hour', ...)`,
    # which PostgreSQL refuses: date_trunc on timestamptz is STABLE, not
    # IMMUTABLE, so it cannot appear in an index expression. Bucketing to a
    # 300-second epoch slice is immutable and gives the same guarantee.
    submitted_bucket = models.BigIntegerField(editable=False, null=True)
    corrected_by = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="corrects"
    )
    created_by = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "mentorship_session"
        indexes = [
            models.Index(fields=["placement", "-session_date"]),
            models.Index(fields=["mentor_assignment", "session_date"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(duration_minutes=None)
                | models.Q(duration_minutes__gte=1, duration_minutes__lte=480),
                name="session_duration_sane",
            ),
            # WFR-014 at the database, so a second write path cannot create the
            # field failure mode (duplicate logs nobody can explain).
            models.UniqueConstraint(
                fields=["placement", "mentor_assignment", "session_date", "submitted_bucket"],
                name="session_no_duplicate_within_window",
            ),
        ]

    def save(self, *args, **kwargs):
        # A derived field on the same row — the only thing save() may do (§2.2).
        if self.submitted_bucket is None:
            from django.utils import timezone

            stamp = self.submitted_at or timezone.now()
            self.submitted_bucket = int(stamp.timestamp()) // 300
            if "update_fields" in kwargs and kwargs["update_fields"] is not None:
                kwargs["update_fields"] = list(kwargs["update_fields"]) + ["submitted_bucket"]
        super().save(*args, **kwargs)


class SessionTopic(models.Model):
    """Rows, not an array: WFR-009 needs at least one, and dashboards group by it."""

    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name="topics")
    topic = models.CharField(max_length=60)

    class Meta:
        db_table = "mentorship_session_topic"
        constraints = [
            models.UniqueConstraint(fields=["session", "topic"], name="one_row_per_session_topic")
        ]
