"""The Placement aggregate — the core domain (Stage 4 §4.3, Stage 5 §5)."""

from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateRangeField, RangeOperators
from django.db import models
from django.db.models import F, Func, Q, Value

from apps.core.models import BaseModel, new_id


class State(models.TextChoices):
    DRAFT = "draft", "Draft"
    SCHEDULED = "scheduled", "Scheduled"
    AWAITING_STUDENT = "awaiting_student", "Awaiting Student"
    ORIENTATION = "orientation", "Orientation"
    INDUCTION = "induction", "Induction"
    ACTIVE = "active", "Active"
    PAUSED = "paused", "Paused"
    COMPLETED = "completed", "Completed"
    ARCHIVED = "archived", "Archived"
    WITHDRAWN = "withdrawn", "Withdrawn"


TERMINAL_STATES = {State.ARCHIVED, State.WITHDRAWN}

#: States that occupy a ward slot (POL-007).
OCCUPYING_STATES = [State.ORIENTATION, State.INDUCTION, State.ACTIVE, State.PAUSED]


class PauseReason(models.TextChoices):
    """POL-021 — a controlled vocabulary so causes of interruption are countable."""

    STUDENT_ILLNESS = "student_illness", "Student illness"
    PERSONAL_FAMILY = "personal_family", "Personal or family"
    INDUSTRIAL_ACTION = "industrial_action", "Industrial action"
    FACILITY_CLOSURE = "facility_closure", "Facility closure"
    WARD_CAPACITY = "ward_capacity", "Ward capacity"
    ACADEMIC_EXAMINATIONS = "academic_examinations", "Academic or examinations"
    MENTOR_UNAVAILABILITY = "mentor_unavailability", "Mentor unavailability"
    SAFEGUARDING_INVESTIGATION = "safeguarding_investigation", "Safeguarding investigation"
    PUBLIC_HEALTH_EMERGENCY = "public_health_emergency", "Public health emergency"
    OTHER = "other", "Other"


class WithdrawalReason(models.TextChoices):
    STUDENT_WITHDREW = "student_withdrew", "Student withdrew"
    ACADEMIC_DECISION = "academic_decision", "Academic decision"
    FACILITY_CAPACITY = "facility_capacity", "Facility capacity"
    SAFEGUARDING = "safeguarding", "Safeguarding"
    ADMINISTRATIVE_ERROR = "administrative_error", "Administrative error"
    OTHER = "other", "Other"


class Placement(BaseModel):
    cohort = models.ForeignKey("institutions.Cohort", on_delete=models.PROTECT, related_name="placements")

    # Denormalised for row-level scoping (SADD §6.2). Guaranteed equal to the
    # derived value by the scope guard in services (POL-006, INV-17).
    institution = models.ForeignKey("institutions.Institution", on_delete=models.PROTECT, related_name="placements")
    facility = models.ForeignKey(
        "facilities.Facility", on_delete=models.PROTECT, null=True, blank=True, related_name="placements"
    )

    # The partner facility the coordinator is asking to host this student. It is a
    # request, not an allocation: the facility is only derived (INV-17) once a
    # ward is allocated by that facility's nurse manager.
    requested_facility = models.ForeignKey(
        "facilities.Facility", on_delete=models.PROTECT, null=True, blank=True, related_name="requested_placements"
    )

    # When the request was made, so the facility and the coordinator can say "requested since".
    requested_at = models.DateTimeField(null=True, blank=True)

    # The last facility that declined to host this student, and why, so the coordinator can ask another.
    declined_facility = models.ForeignKey(
        "facilities.Facility", on_delete=models.PROTECT, null=True, blank=True, related_name="declined_placements"
    )
    decline_reason = models.CharField(max_length=300, blank=True, default="")
    declined_at = models.DateTimeField(null=True, blank=True)

    state = models.CharField(max_length=24, choices=State.choices, default=State.DRAFT)

    # OD-01 (JKUAT, 30 Jul 2026): planned dates are the original agreement;
    # actual dates move when a pause extends the placement (POL-020).
    planned_start = models.DateField()
    planned_end = models.DateField()
    actual_start = models.DateField(null=True, blank=True)
    actual_end = models.DateField(null=True, blank=True)

    withdrawal_reason = models.CharField(
        max_length=32, choices=WithdrawalReason.choices, null=True, blank=True
    )
    withdrawal_note = models.TextField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    version = models.IntegerField(default=0)
    # What the student was last told before release, so a change triggers an update, not silence or repetition.
    provisional_notice_hash = models.CharField(max_length=64, blank=True, default="")
    provisional_notice_at = models.DateTimeField(null=True, blank=True)
    lead_reminders = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="created_placements")

    class Meta:
        db_table = "placements_placement"
        indexes = [
            models.Index(fields=["institution", "state"]),
            models.Index(fields=["facility", "state"]),
            models.Index(fields=["requested_facility", "state"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=Q(planned_start__lt=F("planned_end")), name="planned_dates_ordered"
            ),
            models.CheckConstraint(
                check=Q(actual_end=None) | Q(actual_start=None) | Q(actual_start__lte=F("actual_end")),
                name="actual_dates_ordered",
            ),
            # WFR-004: a terminal withdrawal always carries a reason.
            models.CheckConstraint(
                check=~Q(state="withdrawn") | ~Q(withdrawal_reason=None), name="withdrawn_needs_reason"
            ),
            models.CheckConstraint(
                check=~Q(state="completed") | ~Q(completed_at=None), name="completed_has_timestamp"
            ),
        ]

    @property
    def effective_end(self):
        return self.actual_end or self.planned_end

    def __str__(self):
        return f"Placement {self.id} ({self.state})"


class PlacementAcknowledgement(models.Model):
    """Immutable student signature for the issued placement assignment."""

    id = models.UUIDField(primary_key=True, default=new_id, editable=False)
    placement = models.OneToOneField(
        Placement, on_delete=models.PROTECT, related_name="student_acknowledgement"
    )
    student = models.ForeignKey(
        "identity.User", on_delete=models.PROTECT, related_name="placement_acknowledgements"
    )
    signed_name = models.CharField(max_length=240)
    signed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "placements_acknowledgement"


class PlacementNote(BaseModel):
    """Operational note owned by a placement and visible to scoped staff."""
    placement = models.ForeignKey(Placement, on_delete=models.PROTECT, related_name="notes")
    author = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="placement_notes")
    body = models.TextField()

    class Meta:
        db_table = "placements_note"
        ordering = ["-created_at"]


class PlacementBatch(BaseModel):
    """Durable progress record for cohort placement creation."""

    STATUS_CHOICES = [(value, value) for value in ("queued", "processing", "completed", "failed")]
    actor_id = models.UUIDField()
    cohort_id = models.UUIDField()
    planned_start = models.DateField()
    planned_end = models.DateField()
    student_ids = models.JSONField(default=list)
    all_eligible = models.BooleanField(default=False)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="queued")
    created_placement_ids = models.JSONField(default=list)
    skipped = models.JSONField(default=list)
    error_message = models.TextField(blank=True, default="")

    class Meta:
        db_table = "placements_placement_batch"
        indexes = [models.Index(fields=["actor_id", "-created_at"], name="placements__actor_i_4b30f6_idx")]


class _Assignment(BaseModel):
    """Shared shape: an assignment is an interval, so history survives change."""

    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    end_reason = models.CharField(max_length=120, blank=True, default="")
    created_by = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="+")

    class Meta:
        abstract = True


class StudentAssignment(_Assignment):
    placement = models.ForeignKey(Placement, on_delete=models.PROTECT, related_name="student_assignments")
    student = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="student_assignments")
    # Kept as dates so an exclusion constraint can forbid overlaps.
    started_on = models.DateField()
    ended_on = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "placements_student_assignment"
        constraints = [
            # INV-01 / INV-12: at most one OPEN assignment. A full unique index
            # would forbid history; the partial index forbids only concurrency.
            models.UniqueConstraint(
                fields=["placement"], condition=Q(ended_at=None), name="one_active_student_per_placement"
            ),
            # StudentAlreadyAssigned: a student cannot hold two overlapping placements.
            ExclusionConstraint(
                name="student_no_overlapping_placements",
                expressions=[
                    (F("student"), RangeOperators.EQUAL),
                    (
                        Func(
                            F("started_on"), F("ended_on"), Value("[)"),
                            function="daterange", output_field=DateRangeField(),
                        ),
                        RangeOperators.OVERLAPS,
                    ),
                ],
            ),
        ]


class MentorAssignment(_Assignment):
    placement = models.ForeignKey(Placement, on_delete=models.PROTECT, related_name="mentor_assignments")
    mentor = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="mentor_assignments")

    class Meta:
        db_table = "placements_mentor_assignment"
        constraints = [
            models.UniqueConstraint(
                fields=["placement"], condition=Q(ended_at=None), name="one_active_mentor_per_placement"
            )
        ]
        indexes = [models.Index(fields=["mentor"], condition=Q(ended_at=None), name="mentor_active_idx")]


class WardAssignment(_Assignment):
    placement = models.ForeignKey(Placement, on_delete=models.PROTECT, related_name="ward_assignments")
    ward = models.ForeignKey("facilities.Ward", on_delete=models.PROTECT, related_name="ward_assignments")

    class Meta:
        db_table = "placements_ward_assignment"
        constraints = [
            models.UniqueConstraint(
                fields=["placement"], condition=Q(ended_at=None), name="one_active_ward_per_placement"
            )
        ]


class PauseInterval(BaseModel):
    """WFR-003 — a first-class record, not a boolean.

    `reason` is a vocabulary rather than free text specifically so that "why is
    training being interrupted?" is answerable with a GROUP BY (POL-021).
    """

    placement = models.ForeignKey(Placement, on_delete=models.PROTECT, related_name="pauses")
    started_on = models.DateField()
    ended_on = models.DateField(null=True, blank=True)
    reason = models.CharField(max_length=40, choices=PauseReason.choices)
    reason_note = models.TextField(null=True, blank=True)
    paused_by = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="+")
    resumed_by = models.ForeignKey(
        "identity.User", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )

    class Meta:
        db_table = "placements_pause_interval"
        constraints = [
            models.CheckConstraint(
                check=Q(ended_on=None) | Q(started_on__lte=F("ended_on")), name="pause_dates_ordered"
            ),
            models.UniqueConstraint(
                fields=["placement"], condition=Q(ended_on=None), name="one_open_pause_per_placement"
            ),
            ExclusionConstraint(
                name="pause_no_overlap",
                expressions=[
                    (F("placement"), RangeOperators.EQUAL),
                    (
                        Func(
                            F("started_on"), F("ended_on"), Value("[)"),
                            function="daterange", output_field=DateRangeField(),
                        ),
                        RangeOperators.OVERLAPS,
                    ),
                ],
            ),
        ]


class AllocationRun(BaseModel):
    """One automatic arrangement, kept so an allocation is explainable and repeatable."""

    class Mode(models.TextChoices):
        FACILITY_SPLIT = "facility_split", "Split across partner facilities"
        AUTO_ARRANGE = "auto_arrange", "Arrange into wards and mentors"

    mode = models.CharField(max_length=24, choices=Mode.choices)
    facility = models.ForeignKey("facilities.Facility", on_delete=models.PROTECT, null=True, blank=True, related_name="allocation_runs")
    institution = models.ForeignKey("institutions.Institution", on_delete=models.PROTECT, null=True, blank=True, related_name="allocation_runs")
    actor = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="allocation_runs")
    strategy = models.CharField(max_length=24)
    seed = models.CharField(max_length=40)
    summary = models.JSONField(default=dict)
    # The run is recorded before any student is touched, so a crash leaves an explainable trail.
    status = models.CharField(max_length=16, default="completed")  # running | completed | partial | failed
    plan_hash = models.CharField(max_length=64, blank=True, default="")
    result = models.JSONField(default=dict, blank=True)  # stored so an idempotent replay can return the real outcome
    # Institutions whose students this run touched, so a coordinator can read the results that concern them.
    institution_ids = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "placements_allocation_run"
