"""Identity: who is acting, and what they are scoped to."""

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

from apps.core.models import BaseModel


class Program(BaseModel):
    """The programme a deployment belongs to. Program Admins are scoped here."""

    name = models.CharField(max_length=120)

    class Meta:
        db_table = "identity_program"

    def __str__(self):
        return self.name


class Role(models.TextChoices):
    STUDENT = "student", "Student"
    MENTOR = "mentor", "Clinical Mentor"
    NURSE_MANAGER = "nurse_manager", "Nurse Manager"
    COORDINATOR = "coordinator", "University Coordinator"
    PROGRAM_ADMIN = "program_admin", "Programme Administrator"


class Status(models.TextChoices):
    INVITED = "invited", "Invited"
    ACTIVE = "active", "Active"
    SUSPENDED = "suspended", "Suspended"
    DEACTIVATED = "deactivated", "Deactivated"


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError("email is required")
        user = self.model(email=self.normalize_email(email), **extra)
        user.password = make_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("role", Role.PROGRAM_ADMIN)
        extra.setdefault("status", Status.ACTIVE)
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra)


class User(BaseModel, AbstractBaseUser, PermissionsMixin):
    """One account, one role, one organisation (AUTH-003).

    No sex or gender column: POL-013b. If the research evaluation later requires
    sex-disaggregated reporting (OD-12) it is added here, on the
    university-owned record, and never joined into a mentor-facing projection.
    """

    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=32, blank=True, default="")
    first_name = models.CharField(max_length=120)
    last_name = models.CharField(max_length=120)
    role = models.CharField(max_length=32, choices=Role.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.INVITED)

    program = models.ForeignKey(Program, on_delete=models.PROTECT, related_name="users")

    # Bare identifiers, not foreign keys — deliberately (MA-12).
    #
    # `identity` is layer 0 and must depend on nothing; an FK to
    # institutions/facilities (layer 1) would be an upward relation, invisible to
    # import-linter because it is declared as a string. The integrity trade is
    # acceptable *here specifically* because a dangling scope id fails CLOSED:
    # `selectors.in_scope` filters on it, so a bad value yields no rows rather
    # than leaking another tenant's. Contrast the session -> placement FK, whose
    # absence fails OPEN (see tests/test_fk_stress.py). Validated on write by the
    # owning module's api.py.
    institution_id = models.UUIDField(null=True, blank=True)
    facility_id = models.UUIDField(null=True, blank=True)

    is_staff = models.BooleanField(default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    objects = UserManager()

    class Meta:
        db_table = "identity_user"
        constraints = [
            # AUTH-003: a student belongs to a university, a mentor belongs to a
            # hospital, and nobody belongs to both. Making this a constraint stops
            # it being an assumption the scope resolver rests on.
            models.CheckConstraint(
                check=(
                    models.Q(role="program_admin", institution_id=None, facility_id=None)
                    | models.Q(
                        role__in=["student", "coordinator"],
                        facility_id=None, institution_id__isnull=False,
                    )
                    | models.Q(
                        role__in=["mentor", "nurse_manager"],
                        institution_id=None, facility_id__isnull=False,
                    )
                ),
                name="user_one_organisation",
            )
        ]

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def __str__(self):
        return self.email
