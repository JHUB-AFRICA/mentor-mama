"""The hospital side: facilities and wards."""

from django.db import models

from apps.core.models import BaseModel


class Facility(BaseModel):
    program = models.ForeignKey("identity.Program", on_delete=models.PROTECT, related_name="facilities")
    name = models.CharField(max_length=200)
    county = models.CharField(max_length=60, blank=True, default="")
    level = models.CharField(max_length=60, blank=True, default="")
    maternity_unit_name = models.CharField(max_length=200, blank=True, default="")
    contact_person = models.CharField(max_length=120, blank=True, default="")
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "facilities_facility"

    def __str__(self):
        return self.name


class Ward(BaseModel):
    facility = models.ForeignKey(Facility, on_delete=models.PROTECT, related_name="wards")
    name = models.CharField(max_length=200)
    shift_pattern = models.CharField(max_length=120, blank=True, default="")
    max_students = models.IntegerField()
    nurse_manager = models.ForeignKey(
        "identity.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="managed_wards"
    )
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "facilities_ward"
        constraints = [
            models.CheckConstraint(check=models.Q(max_students__gt=0), name="ward_capacity_positive")
        ]

    def __str__(self):
        return f"{self.facility.name} — {self.name}"
