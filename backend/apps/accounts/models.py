"""User models for the MentorMAMA backend."""

from django.contrib.auth.models import AbstractUser
from django.db import models

from apps.core.models import BaseModel


class User(BaseModel, AbstractUser):
    """Custom user model with UUID primary key and role field."""

    class Role(models.TextChoices):
        STUDENT = "student", "Student"
        MENTOR = "mentor", "Mentor"
        NURSE_MANAGER = "nurse_manager", "Nurse Manager"
        UNIVERSITY_COORDINATOR = "university_coordinator", "University Coordinator"
        ADMIN = "admin", "Admin"

    role = models.CharField(
        max_length=30,
        choices=Role.choices,
        default=Role.STUDENT,
    )

    def __str__(self):
        return self.username
