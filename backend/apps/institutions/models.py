"""The university side: institutions, cohorts, enrolment."""

from django.db import models
from PIL import Image

from apps.core.models import BaseModel
from apps.core.storage import private_storage
from apps.core.validators import validate_partner_logo


def partner_logo_upload_to(instance, filename):
    with Image.open(instance.logo.file) as image:
        extension = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}[image.format]
    return f"directory/institutions/{instance.id}/logo.{extension}"

class Institution(BaseModel):
    program = models.ForeignKey("identity.Program", on_delete=models.PROTECT, related_name="institutions")
    name = models.CharField(max_length=200)
    type = models.CharField(max_length=60, blank=True, default="")
    county = models.CharField(max_length=60, blank=True, default="")
    contact_person = models.CharField(max_length=120, blank=True, default="")
    contact_email = models.EmailField(blank=True, default="")
    contact_phone = models.CharField(max_length=32, blank=True, default="")
    logo = models.ImageField(upload_to=partner_logo_upload_to, storage=private_storage, blank=True, null=True, validators=[validate_partner_logo])
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
    removed_at = models.DateTimeField(null=True, blank=True)
    removed_by_id = models.UUIDField(null=True, blank=True)
    removal_reason = models.CharField(max_length=300, blank=True, default="")

    class Meta:
        db_table = "institutions_cohort_membership"
        constraints = [
            models.UniqueConstraint(fields=["cohort", "student"], condition=models.Q(removed_at__isnull=True), name="one_active_membership_per_cohort"),
        ]


class StudentProfile(BaseModel):
    """Student-owned academic and emergency contact details.

    These details are deliberately separate from the coordinator roster and
    are not included in hospital/mentor placement projections.
    """

    student = models.OneToOneField("identity.User", on_delete=models.CASCADE, related_name="student_profile")
    course_name = models.CharField(max_length=160, blank=True, default="")
    year_of_study = models.PositiveSmallIntegerField(null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    emergency_contact_name = models.CharField(max_length=160, blank=True, default="")
    emergency_contact_phone = models.CharField(max_length=32, blank=True, default="")
    emergency_contact_relationship = models.CharField(max_length=80, blank=True, default="")

    class Meta:
        db_table = "institutions_student_profile"
