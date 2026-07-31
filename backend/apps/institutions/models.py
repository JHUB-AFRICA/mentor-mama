"""The university side: institutions, cohorts, enrolment."""

from django.db import models

from apps.core.models import BaseModel


class Institution(BaseModel):
    program = models.ForeignKey("identity.Program", on_delete=models.PROTECT, related_name="institutions")
    name = models.CharField(max_length=200)
    type = models.CharField(max_length=60, blank=True, default="")
    county = models.CharField(max_length=60, blank=True, default="")
    contact_person = models.CharField(max_length=120, blank=True, default="")
    is_active = models.BooleanField(default=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "institutions_institution"

    def __str__(self):
        return self.name


class Cohort(BaseModel):
    institution = models.ForeignKey(Institution, on_delete=models.PROTECT, related_name="cohorts")
    name = models.CharField(max_length=200)
    start_date = models.DateField()
    end_date = models.DateField()
    # POL-008: a planning target that warns, never a constraint that blocks.
    planned_capacity = models.IntegerField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "institutions_cohort"
        constraints = [
            models.CheckConstraint(
                check=models.Q(start_date__lt=models.F("end_date")), name="cohort_dates_ordered"
            ),
            models.CheckConstraint(
                check=models.Q(planned_capacity=None) | models.Q(planned_capacity__gt=0),
                name="cohort_capacity_positive",
            ),
        ]

    def __str__(self):
        return self.name


class CohortMembership(BaseModel):
    cohort = models.ForeignKey(Cohort, on_delete=models.PROTECT, related_name="memberships")
    student = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="cohort_memberships")

    class Meta:
        db_table = "institutions_cohort_membership"
        constraints = [
            models.UniqueConstraint(fields=["cohort", "student"], name="one_membership_per_cohort")
        ]
