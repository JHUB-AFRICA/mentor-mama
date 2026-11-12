"""Identity: who is acting, and what they are scoped to."""

import uuid

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

from apps.core.models import BaseModel


class Program(BaseModel):
    """The programme a deployment belongs to. Program Admins are scoped here."""

    name = models.CharField(max_length=120)
    short_name = models.CharField(max_length=40, blank=True, default="")
    description = models.TextField(blank=True, default="")
    academic_year = models.CharField(max_length=20, blank=True, default="")
    owner = models.ForeignKey("User", null=True, blank=True, on_delete=models.SET_NULL, related_name="owned_programmes")
    require_mentor_training_before_placement = models.BooleanField(default=True)
    # A sandbox programme for presentations (see `manage.py seed_demo`). Only when DEMO_MODE is on does it get
    # one-tap sign-in without MFA, and only for the accounts named in `demo_logins` ({role: user id}).
    is_demo = models.BooleanField(default=False)
    demo_logins = models.JSONField(default=dict, blank=True)
    directory_reviewed_at = models.DateTimeField(null=True, blank=True)
    directory_reviewed_by = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="reviewed_programme_directories",
    )

    class Meta:
        db_table = "identity_program"

    def __str__(self):
        return self.name


class BootstrapEvent(BaseModel):
    """Auditable infrastructure bootstrap action before a human actor exists."""

    program = models.ForeignKey(Program, on_delete=models.PROTECT, related_name="bootstrap_events", null=True, blank=True)
    email = models.EmailField()
    action = models.CharField(max_length=64)
    details = models.JSONField(default=dict)

    class Meta:
        db_table = "identity_bootstrap_event"


class Role(models.TextChoices):
    STUDENT = "student", "Student"
    MENTOR = "mentor", "Clinical Mentor"
    NURSE_MANAGER = "nurse_manager", "Nurse Manager"
    COORDINATOR = "coordinator", "University Coordinator"
    PROGRAM_ADMIN = "program_admin", "Programme Administrator"
    # Operates the whole deployment: creates programmes, invites their admins, handles support. Belongs to no programme.
    PLATFORM_ADMIN = "platform_admin", "Platform Administrator"


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
        # `manage.py createsuperuser` creates a platform operator, who belongs to no programme.
        extra.setdefault("role", Role.PLATFORM_ADMIN)
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
    # University-owned identifier. It is unique within an institution, not
    # globally, because institutions may use overlapping numbering schemes.
    registration_number = models.CharField(max_length=64, blank=True, default="")
    first_name = models.CharField(max_length=120)
    last_name = models.CharField(max_length=120)
    role = models.CharField(max_length=32, choices=Role.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.INVITED)
    # Facility mentors can pause new allocations without losing their account.
    accepting_students = models.BooleanField(default=True)
    max_active_placements = models.PositiveIntegerField(default=5)

    # Rotating nonces invalidate outstanding links without storing raw secrets.
    invitation_nonce = models.UUIDField(default=uuid.uuid4, editable=False)
    invitation_sent_at = models.DateTimeField(null=True, blank=True)
    password_reset_nonce = models.UUIDField(default=uuid.uuid4, editable=False)
    email_verification_nonce = models.UUIDField(default=uuid.uuid4, editable=False)
    email_verification_code_hash = models.CharField(max_length=128, blank=True, default="")
    email_verification_sent_at = models.DateTimeField(null=True, blank=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)

    # Every account belongs to one programme, except platform administrators, who operate across all of them
    # (enforced by the `user_programme_unless_platform` constraint below).
    program = models.ForeignKey(Program, on_delete=models.PROTECT, related_name="users", null=True, blank=True)

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
    # Set for accounts created with an initial password (the deploy-time platform admin); cleared on the first change.
    must_change_password = models.BooleanField(default=False)

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
                    models.Q(role__in=["program_admin", "platform_admin"], institution_id=None, facility_id=None)
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
            ),
            models.CheckConstraint(
                check=(
                    models.Q(role="platform_admin", program__isnull=True)
                    | (~models.Q(role="platform_admin") & models.Q(program__isnull=False))
                ),
                name="user_programme_unless_platform",
            ),
            models.UniqueConstraint(
                fields=["institution_id", "registration_number"],
                condition=(
                    models.Q(role="student")
                    & models.Q(registration_number__gt="")
                ),
                name="unique_student_registration_per_institution",
            ),
        ]

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def __str__(self):
        return self.email


class UserSession(BaseModel):
    """Server-side session inventory; secrets remain in Django's session store."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="user_sessions")
    session_key = models.CharField(max_length=64, unique=True)
    device_label = models.CharField(max_length=160, blank=True, default="")
    user_agent = models.TextField(blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    last_seen_at = models.DateTimeField()
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "identity_user_session"
        indexes = [
            models.Index(fields=["user", "revoked_at", "-last_seen_at"]),
        ]


class MFARecoveryRequest(BaseModel):
    """Support-reviewed request to restore access to an MFA-protected account."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        REVIEWED = "reviewed", "Reviewed"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="mfa_recovery_requests")
    reason = models.CharField(max_length=1000)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)

    class Meta:
        db_table = "identity_mfa_recovery_request"
        indexes = [models.Index(fields=["user", "status", "-created_at"])]


class MentorProfile(BaseModel):
    """Mentor-owned professional details (concept note section 8).

    Everything is optional; CPD identifiers in particular must stay optional
    unless a regulator approves collecting them. Not a placement gate.
    """

    class DigitalLiteracy(models.IntegerChoices):
        BASIC = 1, "Basic"
        DEVELOPING = 2, "Developing"
        COMFORTABLE = 3, "Comfortable"
        CONFIDENT = 4, "Confident"
        ADVANCED = 5, "Advanced"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="mentor_profile")
    cadre = models.CharField(max_length=120, blank=True, default="")
    department = models.CharField(max_length=120, blank=True, default="")
    years_of_practice = models.PositiveSmallIntegerField(null=True, blank=True)
    mentorship_experience_years = models.PositiveSmallIntegerField(null=True, blank=True)
    cpd_identifier = models.CharField(max_length=64, blank=True, default="")
    digital_literacy = models.PositiveSmallIntegerField(null=True, blank=True, choices=DigitalLiteracy.choices)

    class Meta:
        db_table = "identity_mentor_profile"


class ConsentVersion(BaseModel):
    """Versioned consent wording a programme admin publishes. People accept a specific version."""

    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name="consent_versions")
    version = models.PositiveIntegerField()
    title = models.CharField(max_length=160)
    body = models.TextField()
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey("identity.User", on_delete=models.PROTECT, null=True, blank=True, related_name="+")

    class Meta:
        db_table = "identity_consent_version"
        constraints = [models.UniqueConstraint(fields=["program", "version"], name="consent_version_unique_per_program")]
        ordering = ["-version"]


class ConsentRecord(BaseModel):
    """Who accepted which version, and when. The accepted text is the version, never just a tick."""

    user = models.ForeignKey("identity.User", on_delete=models.CASCADE, related_name="consent_records")
    consent_version = models.ForeignKey(ConsentVersion, on_delete=models.PROTECT, related_name="records")
    accepted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "identity_consent_record"
        constraints = [models.UniqueConstraint(fields=["user", "consent_version"], name="consent_once_per_version")]
