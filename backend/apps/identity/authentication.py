"""Account lifecycle services and signed, single-purpose auth links."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.conf import settings
from django.db import transaction
from django.utils.encoding import force_str
from django.utils import timezone
from django.utils.http import urlsafe_base64_decode
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import AuthenticationFailed

from allauth.mfa.models import Authenticator
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from allauth.mfa.totp.internal.auth import TOTP, generate_totp_secret, validate_totp_code
from allauth.mfa.utils import is_mfa_enabled
from django_otp.plugins.otp_email.models import EmailDevice

from apps.core import audit, outbox, errors
from apps.core.errors import UnauthorizedFacilityAccess
from apps.core.models import AuditEntry
from apps.identity import api as identity_api
from apps.identity.models import Program, Role, Status, User, UserSession


INVITATION_MAX_AGE = timedelta(hours=48)
EMAIL_VERIFICATION_MAX_AGE = timedelta(minutes=15)
MFA_REQUIRED_ROLES = frozenset({
    Role.PROGRAM_ADMIN,
    Role.COORDINATOR,
    Role.NURSE_MANAGER,
})
MFA_SETUP_SESSION_KEY = "identity.mfa.setup_secret"
MFA_VERIFIED_SESSION_KEY = "identity.mfa.verified"


def _device_label(user_agent: str) -> str:
    if not user_agent:
        return "Unknown browser"
    lowered = user_agent.lower()
    browser = "Browser"
    for name in ("edg", "chrome", "firefox", "safari"):
        if name in lowered:
            browser = {"edg": "Edge", "chrome": "Chrome", "firefox": "Firefox", "safari": "Safari"}[name]
            break
    platform = ""
    if "android" in lowered:
        platform = " on Android"
    elif "iphone" in lowered or "ipad" in lowered:
        platform = " on iOS"
    elif "windows" in lowered:
        platform = " on Windows"
    elif "mac os" in lowered:
        platform = " on macOS"
    return f"{browser}{platform}"


@transaction.atomic
def register_session(*, request, user: User) -> UserSession:
    # Django may defer creating a database-backed session until the response is
    # saved. Activation calls this immediately after login, so materialise the
    # key before using it as the inventory record's stable identifier.
    if not request.session.session_key:
        request.session.save()
    now = timezone.now()
    return UserSession.objects.update_or_create(
        session_key=request.session.session_key,
        defaults={
            "user": user,
            "device_label": _device_label(request.META.get("HTTP_USER_AGENT", "")),
            "user_agent": request.META.get("HTTP_USER_AGENT", "")[:10000],
            "ip_address": request.META.get("REMOTE_ADDR"),
            "last_seen_at": now,
            "expires_at": request.session.get_expiry_date(),
            "revoked_at": None,
        },
    )[0]


def session_is_valid(*, request, user: User) -> bool:
    key = request.session.session_key
    if not key:
        return False
    record = UserSession.objects.filter(session_key=key, user=user).first()
    if not record:
        register_session(request=request, user=user)
        return True
    if record.revoked_at or record.expires_at <= timezone.now():
        return False
    UserSession.objects.filter(pk=record.pk).update(last_seen_at=timezone.now())
    return True


@transaction.atomic
def revoke_session(*, user: User, session_id: uuid.UUID) -> bool:
    return UserSession.objects.filter(id=session_id, user=user, revoked_at=None).update(
        revoked_at=timezone.now(),
    ) == 1


@transaction.atomic
def revoke_other_sessions(*, user: User, current_session_key: str | None) -> int:
    return UserSession.objects.filter(
        user=user, revoked_at=None,
    ).exclude(session_key=current_session_key).update(revoked_at=timezone.now())


@transaction.atomic
def revoke_account_sessions(*, actor: User, target: User, reason: str) -> int | None:
    target = User.objects.select_for_update().filter(pk=target.pk).first()
    if target is None:
        return None
    if (actor.status != Status.ACTIVE or actor.role != Role.PROGRAM_ADMIN
            or actor.id == target.id or actor.program_id != target.program_id
            or target.status != Status.ACTIVE or not reason.strip()):
        return None
    count = UserSession.objects.filter(user=target, revoked_at=None).update(revoked_at=timezone.now())
    audit.record(actor=actor, action="account.sessions_revoked", entity_table="identity_user",
                 entity_id=target.id, scope={"program_id": str(target.program_id)},
                 changes={"revoked_count": count}, override_reason=reason.strip())
    if count:
        outbox.publish(SecurityNotificationRequested(user_id=target.id, action="account_sessions_revoked"))
    return count


def _can_change_status(*, actor: User, target: User, status: str) -> bool:
    if actor.status != Status.ACTIVE or actor.id == target.id:
        return False
    if actor.program_id != target.program_id:
        return False
    if actor.role == Role.PROGRAM_ADMIN:
        return True
    if status != Status.SUSPENDED:
        return False
    if actor.role == Role.COORDINATOR:
        return target.role == Role.STUDENT and actor.institution_id == target.institution_id
    if actor.role == Role.NURSE_MANAGER:
        return target.role == Role.MENTOR and actor.facility_id == target.facility_id
    return False


@transaction.atomic
def change_status(*, actor: User, target: User, status: str, reason: str) -> User | None:
    target = User.objects.select_for_update().filter(pk=target.pk).first()
    if target is None:
        return None
    if status not in {Status.ACTIVE, Status.SUSPENDED, Status.DEACTIVATED}:
        return None
    if target.status == status:
        return None
    if not _can_change_status(actor=actor, target=target, status=status):
        return None
    # Invitation acceptance must go through activate_user so the recipient sets
    # a password and proves possession of the single-use invitation link.
    if status == Status.ACTIVE and target.status == Status.INVITED:
        return None
    if status == Status.ACTIVE and not target.has_usable_password():
        return None
    if not reason.strip():
        return None
    previous = target.status
    target.status = status
    target.save(update_fields=["status", "updated_at"])
    if status != Status.ACTIVE:
        UserSession.objects.filter(user=target, revoked_at=None).update(revoked_at=timezone.now())
    audit.record(actor=actor, action="account.status_changed", entity_table="identity_user",
                 entity_id=target.id, scope={"program_id": str(target.program_id)},
                 changes={"from": previous, "to": status}, override_reason=reason.strip())
    outbox.publish(SecurityNotificationRequested(user_id=target.id, action=f"account_{status}"))
    return target


@transaction.atomic
def change_access(*, actor: User, target: User, role: str, institution_id=None,
                  facility_id=None, reason: str = "") -> User | None:
    """Change an existing account's role/scope without changing its identity."""
    target = User.objects.select_for_update().filter(pk=target.pk).first()
    if target is None:
        return None
    if (actor.status != Status.ACTIVE or actor.role != Role.PROGRAM_ADMIN
            or actor.id == target.id or actor.program_id != target.program_id):
        return None
    if role not in Role.values or not _valid_invitation_scope(
            role, program_id=target.program_id, institution_id=institution_id, facility_id=facility_id):
        return None
    if role == Role.STUDENT and not target.registration_number:
        return None
    # An unaccepted invitation's email and token describe a specific role and
    # scope. Require a fresh invite so the recipient sees the permissions they
    # are accepting and the old link cannot silently grant changed access.
    if target.status == Status.INVITED or not target.has_usable_password():
        return None
    if not reason.strip():
        return None
    previous = {"role": target.role, "institution_id": str(target.institution_id) if target.institution_id else None,
                "facility_id": str(target.facility_id) if target.facility_id else None}
    target.role = role
    target.institution_id = institution_id if role in {Role.STUDENT, Role.COORDINATOR} else None
    target.facility_id = facility_id if role in {Role.MENTOR, Role.NURSE_MANAGER} else None
    target.save(update_fields=["role", "institution_id", "facility_id", "updated_at"])
    new_access = {"role": target.role, "institution_id": str(target.institution_id) if target.institution_id else None,
                  "facility_id": str(target.facility_id) if target.facility_id else None}
    access_changed = previous != new_access
    if access_changed:
        UserSession.objects.filter(user=target, revoked_at=None).update(revoked_at=timezone.now())
    audit.record(actor=actor, action="account.access_changed", entity_table="identity_user",
                 entity_id=target.id, scope={"program_id": str(target.program_id)},
                 changes={"from": previous, "to": new_access},
                 override_reason=reason.strip() if access_changed else None)
    if access_changed and target.status == Status.ACTIVE:
        outbox.publish(SecurityNotificationRequested(user_id=target.id, action="account_access_changed"))
    return target


@transaction.atomic
def regenerate_recovery_codes(*, user: User) -> list[str]:
    Authenticator.objects.filter(user=user, type=Authenticator.Type.RECOVERY_CODES).delete()
    codes = RecoveryCodes.activate(user).get_unused_codes()
    audit.record(
        actor=user, action="account.backup_codes_regenerated",
        entity_table="identity_user", entity_id=user.id,
        scope={"program_id": str(user.program_id)},
    )
    outbox.publish(SecurityNotificationRequested(user_id=user.id, action="backup_codes_regenerated"))
    return codes


def remove_totp(*, user: User) -> bool:
    if mfa_required(user):
        return False
    return Authenticator.objects.filter(user=user, type=Authenticator.Type.TOTP).delete()[0] == 1


@transaction.atomic
def recover_mfa(*, actor: User, target: User, reason: str) -> bool:
    target = User.objects.select_for_update().filter(pk=target.pk).first()
    if target is None:
        return False
    if (actor.status != Status.ACTIVE or actor.role != Role.PROGRAM_ADMIN
            or actor.id == target.id or actor.program_id != target.program_id
            or target.status != Status.ACTIVE or not reason.strip()):
        return False
    Authenticator.objects.filter(user=target).delete()
    UserSession.objects.filter(user=target, revoked_at=None).update(revoked_at=timezone.now())
    audit.record(actor=actor, action="account.mfa_recovery_override", entity_table="identity_user",
                 entity_id=target.id, scope={"program_id": str(target.program_id)},
                 override_reason=reason.strip())
    outbox.publish(SecurityNotificationRequested(user_id=target.id, action="mfa_recovery"))
    return True


class _InvitationTokenGenerator(PasswordResetTokenGenerator):
    def _make_hash_value(self, user, timestamp):
        return (f"{user.pk}{user.email}{user.password}{user.invitation_nonce}"
                f"{user.invitation_sent_at}{user.role}{user.program_id}"
                f"{user.institution_id}{user.facility_id}{timestamp}")


class _PasswordResetTokenGenerator(PasswordResetTokenGenerator):
    def _make_hash_value(self, user, timestamp):
        return f"{user.pk}{user.password}{user.password_reset_nonce}{timestamp}"


invitation_tokens = _InvitationTokenGenerator()
password_reset_tokens = _PasswordResetTokenGenerator()


@dataclass(frozen=True)
class IdentityInvitationRequested:
    user_id: uuid.UUID


@dataclass(frozen=True)
class PasswordResetRequested:
    user_id: uuid.UUID


@dataclass(frozen=True)
class EmailVerificationRequested:
    user_id: uuid.UUID


@dataclass(frozen=True)
class EmailMFAChallengeRequested:
    user_id: uuid.UUID
    device_id: int


@dataclass(frozen=True)
class SecurityNotificationRequested:
    user_id: uuid.UUID
    action: str


def _can_invite(actor, role, *, institution_id=None, facility_id=None) -> bool:
    if actor.status != Status.ACTIVE:
        return False
    if actor.role == Role.PROGRAM_ADMIN:
        return True
    if actor.role == Role.COORDINATOR:
        return role == Role.STUDENT and actor.institution_id == institution_id
    if actor.role == Role.NURSE_MANAGER:
        return role == Role.MENTOR and actor.facility_id == facility_id
    return False


@transaction.atomic
def invite_user(*, actor, email, first_name, last_name, role, program_id,
                institution_id=None, facility_id=None, phone="", registration_number="") -> User:
    """Create or rotate an invite without exposing a raw token in the outbox."""
    if not _valid_invitation_scope(
        role,
        program_id=program_id,
        institution_id=institution_id,
        facility_id=facility_id,
    ):
        raise UnauthorizedFacilityAccess()
    if not _can_invite(actor, role, institution_id=institution_id, facility_id=facility_id):
        raise UnauthorizedFacilityAccess()
    if actor.program_id != program_id:
        raise UnauthorizedFacilityAccess()
    registration_number = registration_number.strip().upper()
    if role == Role.STUDENT and not registration_number:
        raise ValueError("student registration_number is required")
    if role == Role.STUDENT and User.objects.filter(
        institution_id=institution_id,
        role=Role.STUDENT,
        registration_number=registration_number,
    ).exclude(email=User.objects.normalize_email(email)).exists():
        raise ValueError("student registration_number is already in use at this institution")
    user, created = User.objects.get_or_create(
        email=User.objects.normalize_email(email),
        defaults={
            "first_name": first_name,
            "last_name": last_name,
            "role": role,
            "status": Status.INVITED,
            "program_id": program_id,
            "institution_id": institution_id,
            "facility_id": facility_id,
            "phone": phone,
            "registration_number": registration_number,
        },
    )
    if not created:
        if user.program_id != program_id or user.status == Status.ACTIVE:
            raise UnauthorizedFacilityAccess()
        user.first_name = first_name
        user.last_name = last_name
        user.role = role
        user.institution_id = institution_id
        user.facility_id = facility_id
        user.phone = phone
        user.registration_number = registration_number
    user.set_unusable_password()
    user.status = Status.INVITED
    user.invitation_nonce = uuid.uuid4()
    user.invitation_sent_at = timezone.now()
    user.save()
    audit.record(actor=actor, action="account.invited", entity_table="identity_user",
                 entity_id=user.id, scope={"program_id": str(program_id)},
                 changes={"role": role, "status": Status.INVITED})
    outbox.publish(IdentityInvitationRequested(user_id=user.id))
    return user


def _valid_invitation_scope(role, *, program_id, institution_id=None, facility_id=None) -> bool:
    """Enforce the one-role/one-scope contract before writing a user."""
    if role == Role.PROGRAM_ADMIN:
        return institution_id is None and facility_id is None
    if role in {Role.STUDENT, Role.COORDINATOR}:
        return (
            institution_id is not None
            and facility_id is None
            and identity_api.valid_scope(scope="institution", scope_id=institution_id, program_id=program_id)
        )
    if role in {Role.MENTOR, Role.NURSE_MANAGER}:
        return (
            facility_id is not None
            and institution_id is None
            and identity_api.valid_scope(scope="facility", scope_id=facility_id, program_id=program_id)
        )
    return False


@transaction.atomic
def _bulk_invite_scoped_users(*, actor: User, rows: list[dict], dry_run: bool, actor_role: str, target_role: str, scope_field: str) -> dict:
    """Preview or issue a bounded, single-scope invitation command."""
    scope_id = getattr(actor, scope_field)
    if actor.status != Status.ACTIVE or actor.role != actor_role or not scope_id:
        raise UnauthorizedFacilityAccess()

    seen_emails: set[str] = set()
    results = []
    valid_rows = []
    for index, row in enumerate(rows, start=2):
        email = User.objects.normalize_email(row["email"]).casefold()
        if email in seen_emails:
            results.append({"row": index, "email": email, "status": "rejected", "code": "duplicate_in_file", "message": "This email appears more than once in the file."})
            continue
        seen_emails.add(email)
        existing = User.objects.filter(email=email).first()
        if existing and existing.program_id != actor.program_id:
            results.append({"row": index, "email": email, "status": "rejected", "code": "account_unavailable", "message": "This email is already associated with another programme."})
            continue
        if existing and existing.status == Status.ACTIVE:
            results.append({"row": index, "email": email, "status": "rejected", "code": "already_active", "message": "An active account already exists for this email."})
            continue
        if existing:
            results.append({"row": index, "email": email, "status": "rejected", "code": "already_invited", "message": "An account or invitation already exists for this email."})
            continue
        registration_number = row.get("registration_number", "").strip().upper()
        if target_role == Role.STUDENT and not registration_number:
            results.append({"row": index, "email": email, "status": "rejected", "code": "missing_registration_number", "message": "A student registration number is required."})
            continue
        if target_role == Role.STUDENT and any(
            valid_row.get("registration_number", "").strip().upper() == registration_number
            for _, valid_row in valid_rows
        ):
            results.append({"row": index, "email": email, "status": "rejected", "code": "duplicate_registration_number", "message": "This registration number appears more than once in the file."})
            continue
        if target_role == Role.STUDENT and User.objects.filter(
            institution_id=scope_id,
            role=Role.STUDENT,
            registration_number=registration_number,
        ).exists():
            results.append({"row": index, "email": email, "status": "rejected", "code": "registration_number_in_use", "message": "This registration number is already in use at the institution."})
            continue
        valid_rows.append((index, row))
        results.append({"row": index, "email": email, "status": "ready", "code": "ready", "message": "Ready to invite."})

    if not dry_run:
        for index, row in valid_rows:
            invite_user(
                actor=actor,
                program_id=actor.program_id,
                institution_id=scope_id if scope_field == "institution_id" else None,
                facility_id=scope_id if scope_field == "facility_id" else None,
                role=target_role,
                email=row["email"],
                first_name=row["first_name"].strip(),
                last_name=row["last_name"].strip(),
                phone=row.get("phone", "").strip(),
                registration_number=row.get("registration_number", "").strip(),
            )
        if valid_rows:
            audit.record(
                actor=actor,
                action="account.bulk_invited",
                entity_table="identity_user",
                entity_id=actor.id,
                scope={"program_id": str(actor.program_id), scope_field: str(scope_id)},
                changes={"count": len(valid_rows), "role": target_role},
            )
        for result in results:
            if result["status"] == "ready":
                result["status"] = "invited"
                result["message"] = "Invitation queued."

    accepted = sum(result["status"] in {"ready", "invited"} for result in results)
    return {"results": results, "accepted_count": accepted, "rejected_count": len(results) - accepted, "dry_run": dry_run}


def bulk_invite_students(*, actor: User, rows: list[dict], dry_run: bool = True) -> dict:
    """Preview or issue institution-scoped student invitations."""
    return _bulk_invite_scoped_users(
        actor=actor,
        rows=rows,
        dry_run=dry_run,
        actor_role=Role.COORDINATOR,
        target_role=Role.STUDENT,
        scope_field="institution_id",
    )


def bulk_invite_mentors(*, actor: User, rows: list[dict], dry_run: bool = True) -> dict:
    """Preview or issue facility-scoped clinical mentor invitations."""
    return _bulk_invite_scoped_users(
        actor=actor,
        rows=rows,
        dry_run=dry_run,
        actor_role=Role.NURSE_MANAGER,
        target_role=Role.MENTOR,
        scope_field="facility_id",
    )


@transaction.atomic
def resend_invitation(*, actor: User, target: User) -> bool:
    """Rotate and re-queue an invitation without changing account details."""
    if actor.status != Status.ACTIVE or actor.role != Role.PROGRAM_ADMIN:
        return False
    target = User.objects.select_for_update().filter(
        id=target.id, program_id=actor.program_id,
    ).first()
    if target is None or not (target.status == Status.INVITED or (
        target.status == Status.DEACTIVATED and not target.has_usable_password()
    )):
        return False
    if target is None:
        return False
    day_ago = timezone.now() - timedelta(hours=24)
    if AuditEntry.objects.filter(
        entity_table="identity_user", entity_id=target.id,
        action="account.invitation_resent", occurred_at__gte=day_ago,
    ).count() >= 3:
        raise errors.InvitationResendThrottled()
    target.invitation_nonce = uuid.uuid4()
    target.invitation_sent_at = timezone.now()
    target.status = Status.INVITED
    target.set_unusable_password()
    target.save(update_fields=["invitation_nonce", "invitation_sent_at", "status", "password", "updated_at"])
    audit.record(actor=actor, action="account.invitation_resent", entity_table="identity_user",
                 entity_id=target.id, scope={"program_id": str(actor.program_id)},
                 changes={"status": Status.INVITED}, override_reason="Invitation reissued by Programme Admin")
    outbox.publish(IdentityInvitationRequested(user_id=target.id))
    return True


def invitation_token(user: User) -> str:
    return invitation_tokens.make_token(user)


def activate_user(*, user: User, token: str, password: str) -> User | None:
    if user.status != Status.INVITED or not user.invitation_sent_at:
        return None
    if timezone.now() - user.invitation_sent_at > INVITATION_MAX_AGE:
        return None
    if not invitation_tokens.check_token(user, token):
        return None
    user.set_password(password)
    user.status = Status.ACTIVE
    user.invitation_nonce = uuid.uuid4()
    user.invitation_sent_at = None
    user.save(update_fields=["password", "status", "invitation_nonce", "invitation_sent_at", "updated_at"])
    audit.record(actor=user, action="account.activated", entity_table="identity_user",
                 entity_id=user.id, scope={"program_id": str(user.program_id)})
    return user


@transaction.atomic
def issue_email_verification(user: User) -> str:
    """Create a short-lived verification code; the raw code only enters email delivery."""
    import secrets

    code = f"{secrets.randbelow(1_000_000):06d}"
    user.email_verification_nonce = uuid.uuid4()
    user.email_verification_code_hash = make_password(code)
    user.email_verification_sent_at = timezone.now()
    user.save(update_fields=["email_verification_nonce", "email_verification_code_hash", "email_verification_sent_at", "updated_at"])
    cache.set(f"identity:email-verification:{user.email_verification_nonce}", code, timeout=int(EMAIL_VERIFICATION_MAX_AGE.total_seconds()))
    outbox.publish(EmailVerificationRequested(user_id=user.id))
    return code


@transaction.atomic
def verify_email_code(*, user: User, code: str) -> bool:
    if user.email_verified_at or not user.email_verification_sent_at:
        return bool(user.email_verified_at)
    if timezone.now() - user.email_verification_sent_at > EMAIL_VERIFICATION_MAX_AGE:
        return False
    if not check_password(code, user.email_verification_code_hash):
        return False
    user.email_verified_at = timezone.now()
    user.email_verification_code_hash = ""
    user.email_verification_sent_at = None
    user.save(update_fields=["email_verified_at", "email_verification_code_hash", "email_verification_sent_at", "updated_at"])
    audit.record(actor=user, action="account.email_verified", entity_table="identity_user", entity_id=user.id, scope={"program_id": str(user.program_id)})
    return True


def request_password_reset(email: str) -> User | None:
    user = User.objects.filter(email__iexact=email, status=Status.ACTIVE).first()
    if not user:
        return None
    user.password_reset_nonce = uuid.uuid4()
    user.save(update_fields=["password_reset_nonce", "updated_at"])
    outbox.publish(PasswordResetRequested(user_id=user.id))
    return user


@transaction.atomic
def update_profile(*, user: User, first_name: str, last_name: str, phone: str = "") -> User:
    user.first_name = first_name.strip()
    user.last_name = last_name.strip()
    user.phone = phone.strip()
    user.save(update_fields=["first_name", "last_name", "phone", "updated_at"])
    audit.record(actor=user, action="account.profile_updated", entity_table="identity_user",
                 entity_id=user.id, scope={"program_id": str(user.program_id)})
    return user


@transaction.atomic
def update_programme_name(*, actor: User, name: str) -> Program | None:
    if actor.status != Status.ACTIVE or actor.role != Role.PROGRAM_ADMIN:
        return None
    programme = actor.program
    previous = programme.name
    programme.name = name.strip()
    programme.save(update_fields=["name", "updated_at"])
    audit.record(actor=actor, action="programme.settings_updated", entity_table="identity_program",
                 entity_id=programme.id, scope={"program_id": str(programme.id)},
                 changes={"name": {"from": previous, "to": programme.name}})
    return programme


@transaction.atomic
def update_programme_settings(*, actor: User, name: str, short_name: str | None = None, description: str | None = None,
                              academic_year: str | None = None, owner_id=None,
                              require_mentor_training_before_placement: bool | None = None) -> Program | None:
    if actor.status != Status.ACTIVE or actor.role != Role.PROGRAM_ADMIN:
        return None
    programme = actor.program
    owner = User.objects.filter(
        id=owner_id, program_id=programme.id, role=Role.PROGRAM_ADMIN,
        status=Status.ACTIVE,
    ).first()
    if owner is None:
        return None
    previous = {"name": programme.name, "short_name": programme.short_name, "description": programme.description,
                "academic_year": programme.academic_year, "owner_id": str(programme.owner_id) if programme.owner_id else None,
                "require_mentor_training_before_placement": programme.require_mentor_training_before_placement}
    programme.name = name.strip()
    if short_name is not None:
        programme.short_name = short_name.strip()
    if description is not None:
        programme.description = description.strip()
    if academic_year is not None:
        programme.academic_year = academic_year.strip()
    programme.owner = owner
    if require_mentor_training_before_placement is not None:
        programme.require_mentor_training_before_placement = require_mentor_training_before_placement
    programme.save(update_fields=["name", "short_name", "description", "academic_year", "owner", "require_mentor_training_before_placement", "updated_at"])
    audit.record(actor=actor, action="programme.settings_updated", entity_table="identity_program", entity_id=programme.id,
                 scope={"program_id": str(programme.id)}, changes={"from": previous, "to": {"name": programme.name, "short_name": programme.short_name,
                 "description": programme.description, "academic_year": programme.academic_year,
                 "owner_id": str(programme.owner_id) if programme.owner_id else None,
                 "require_mentor_training_before_placement": programme.require_mentor_training_before_placement}})
    return programme


@transaction.atomic
def confirm_programme_directory_coverage(*, actor: User) -> Program | None:
    """Record the active Programme Admin's explicit pilot-directory review."""
    if actor.status != Status.ACTIVE or actor.role != Role.PROGRAM_ADMIN:
        return None
    programme = Program.objects.select_for_update().filter(id=actor.program_id).first()
    if programme is None:
        return None
    from apps.core import audit

    programme.directory_reviewed_at = timezone.now()
    programme.directory_reviewed_by = actor
    programme.save(update_fields=["directory_reviewed_at", "directory_reviewed_by", "updated_at"])
    audit.record(
        actor=actor, action="programme.directory_coverage_reviewed",
        entity_table="identity_program", entity_id=programme.id,
        scope={"program_id": str(programme.id)},
        changes={"reviewed": True},
    )
    return programme


@transaction.atomic
def create_mfa_recovery_request(*, user: User, reason: str):
    from apps.identity.models import MFARecoveryRequest
    if user.status != Status.ACTIVE or not reason.strip():
        return None
    existing = MFARecoveryRequest.objects.select_for_update().filter(
        user=user, status=MFARecoveryRequest.Status.PENDING,
    ).first()
    if existing:
        return existing
    request_record = MFARecoveryRequest.objects.create(user=user, reason=reason.strip())
    audit.record(actor=user, action="account.mfa_recovery_requested", entity_table="identity_user",
                 entity_id=user.id, scope={"program_id": str(user.program_id)})
    return request_record


@transaction.atomic
def review_mfa_recovery_request(*, actor: User, request_id, decision: str, reason: str) -> bool:
    from apps.identity.models import MFARecoveryRequest
    request_record = MFARecoveryRequest.objects.select_for_update().select_related("user").filter(
        pk=request_id, status=MFARecoveryRequest.Status.PENDING,
        user__program_id=actor.program_id,
    ).first()
    if (request_record is None or actor.status != Status.ACTIVE or actor.role != Role.PROGRAM_ADMIN
            or actor.id == request_record.user_id or not reason.strip()
            or decision not in {"recover", "close"}):
        return False
    if decision == "recover" and not recover_mfa(actor=actor, target=request_record.user, reason=reason):
        return False
    if decision == "close" and request_record.user.status == Status.ACTIVE:
        outbox.publish(SecurityNotificationRequested(
            user_id=request_record.user_id, action="mfa_recovery_request_reviewed",
        ))
    request_record.status = MFARecoveryRequest.Status.REVIEWED
    request_record.save(update_fields=["status", "updated_at"])
    audit.record(actor=actor, action="account.mfa_recovery_request_reviewed",
                 entity_table="identity_user", entity_id=request_record.user_id,
                 scope={"program_id": str(actor.program_id)},
                 changes={"decision": decision, "request_id": str(request_record.id)},
                 override_reason=reason.strip())
    return True


@transaction.atomic
def review_platform_mfa_recovery_request(*, actor: User, request_id, decision: str, reason: str) -> bool:
    """Let an operational superuser resolve only requests the programme admin cannot own."""
    from apps.identity.models import MFARecoveryRequest
    request_record = MFARecoveryRequest.objects.select_for_update().select_related("user").filter(
        pk=request_id, status=MFARecoveryRequest.Status.PENDING,
    ).first()
    if (request_record is None or actor.status != Status.ACTIVE or not actor.is_superuser
            or actor.id == request_record.user_id or not reason.strip()
            or decision not in {"recover", "close"}):
        return False
    target = User.objects.select_for_update().filter(pk=request_record.user_id).first()
    if target is None or (decision == "recover" and target.status != Status.ACTIVE):
        return False
    if decision == "recover":
        Authenticator.objects.filter(user=target).delete()
        UserSession.objects.filter(user=target, revoked_at=None).update(revoked_at=timezone.now())
        audit.record(actor=actor, action="account.mfa_recovery_override", entity_table="identity_user",
                     entity_id=target.id, scope={"program_id": str(target.program_id)},
                     override_reason=reason.strip())
        outbox.publish(SecurityNotificationRequested(user_id=target.id, action="mfa_recovery"))
    elif target.status == Status.ACTIVE:
        outbox.publish(SecurityNotificationRequested(user_id=target.id, action="mfa_recovery_request_reviewed"))
    request_record.status = MFARecoveryRequest.Status.REVIEWED
    request_record.save(update_fields=["status", "updated_at"])
    audit.record(actor=actor, action="account.mfa_recovery_request_reviewed",
                 entity_table="identity_user", entity_id=target.id,
                 scope={"program_id": str(target.program_id)},
                 changes={"decision": decision, "request_id": str(request_record.id), "reviewed_by_platform": True},
                 override_reason=reason.strip())
    return True


def reset_password(*, user: User, token: str, password: str) -> bool:
    if user.status != Status.ACTIVE or not password_reset_tokens.check_token(user, token):
        return False
    user.set_password(password)
    user.password_reset_nonce = uuid.uuid4()
    user.save(update_fields=["password", "password_reset_nonce", "updated_at"])
    UserSession.objects.filter(user=user, revoked_at=None).update(revoked_at=timezone.now())
    audit.record(actor=user, action="account.password_reset", entity_table="identity_user",
                 entity_id=user.id, scope={"program_id": str(user.program_id)})
    outbox.publish(SecurityNotificationRequested(user_id=user.id, action="password_reset"))
    return True


def authenticate_user(*, email: str, password: str) -> User | None:
    # Validate credentials independently from account status so the login view
    # can guide a correctly authenticated suspended/deactivated user. Never
    # disclose status until the password is proven. Keep unknown-email timing
    # close to a real password hash check, as ModelBackend does.
    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        User().set_password(password)
        return None
    if not user.check_password(password):
        return None
    return user


def mfa_required(user: User) -> bool:
    return user.role in MFA_REQUIRED_ROLES


def mfa_is_enabled(user: User) -> bool:
    return is_mfa_enabled(user, types=[Authenticator.Type.TOTP])


def email_mfa_device(user: User) -> EmailDevice | None:
    return EmailDevice.objects.filter(user=user, confirmed=True, name="login-email").first()


def email_mfa_enabled(user: User) -> bool:
    return email_mfa_device(user) is not None


@transaction.atomic
def enable_email_mfa(*, user: User) -> EmailDevice:
    if not user.email_verified_at:
        raise errors.EmailMFAUnavailable()
    device, _ = EmailDevice.objects.get_or_create(
        user=user,
        name="login-email",
        defaults={"confirmed": True},
    )
    if not device.confirmed:
        device.confirmed = True
        device.save(update_fields=["confirmed"])
    audit.record(
        actor=user,
        action="account.email_mfa_enabled",
        entity_table="identity_user",
        entity_id=user.id,
        scope={"program_id": str(user.program_id)},
        changes={"device_id": str(device.id)},
    )
    return device


@transaction.atomic
def disable_email_mfa(*, user: User) -> bool:
    deleted, _ = EmailDevice.objects.filter(user=user, name="login-email").delete()
    if deleted:
        audit.record(
            actor=user,
            action="account.email_mfa_disabled",
            entity_table="identity_user",
            entity_id=user.id,
            scope={"program_id": str(user.program_id)},
        )
    return bool(deleted)


@transaction.atomic
def request_email_mfa_challenge(*, user: User) -> EmailDevice:
    device = email_mfa_device(user)
    if device is None:
        raise errors.EmailMFAUnavailable()
    allowed, _details = device.generate_is_allowed()
    if not allowed:
        raise errors.EmailMFAThrottled()
    device.cooldown_set(commit=False)
    device.generate_token(
        valid_secs=settings.OTP_EMAIL_TOKEN_VALIDITY,
        commit=False,
    )
    device.save()
    outbox.publish(EmailMFAChallengeRequested(user_id=user.id, device_id=device.id))
    audit.record(
        actor=user,
        action="account.email_mfa_challenge_requested",
        entity_table="identity_user",
        entity_id=user.id,
        scope={"program_id": str(user.program_id)},
        changes={"device_id": str(device.id)},
    )
    return device


def _mark_mfa_verified(*, request, user: User) -> None:
    """Trust the current login only after rotating its pending session key."""
    previous_key = request.session.session_key
    request.session.cycle_key()
    request.session[MFA_VERIFIED_SESSION_KEY] = True
    if previous_key:
        UserSession.objects.filter(
            user=user, session_key=previous_key, revoked_at=None,
        ).update(revoked_at=timezone.now())
    register_session(request=request, user=user)


@transaction.atomic
def verify_email_mfa(*, request, user: User, code: str) -> bool:
    device = EmailDevice.objects.select_for_update().filter(
        user=user, confirmed=True, name="login-email",
    ).first()
    if device is None or not device.verify_token(code):
        if device is not None:
            audit.record(
                actor=user,
                action="account.email_mfa_failed",
                entity_table="identity_user",
                entity_id=user.id,
                scope={"program_id": str(user.program_id)},
                changes={"device_id": str(device.id)},
            )
        return False
    _mark_mfa_verified(request=request, user=user)
    audit.record(
        actor=user,
        action="account.email_mfa_verified",
        entity_table="identity_user",
        entity_id=user.id,
        scope={"program_id": str(user.program_id)},
        changes={"device_id": str(device.id)},
    )
    return True


def begin_mfa_setup(*, request, user: User) -> dict[str, str]:
    secret = generate_totp_secret()
    request.session[MFA_SETUP_SESSION_KEY] = secret
    issuer = "MentorMAMA"
    label = f"{issuer}:{user.email}"
    uri = (
        f"otpauth://totp/{label}?secret={secret}&issuer={issuer}"
        "&algorithm=SHA1&digits=6&period=30"
    )
    return {"secret": secret, "otpauth_uri": uri}


@transaction.atomic
def complete_mfa_setup(*, request, user: User, code: str) -> list[str] | None:
    secret = request.session.get(MFA_SETUP_SESSION_KEY)
    if not secret or not validate_totp_code(secret, code):
        audit.record(
            actor=user, action="account.mfa_setup_failed",
            entity_table="identity_user", entity_id=user.id,
            scope={"program_id": str(user.program_id)},
        )
        return None
    if mfa_is_enabled(user):
        request.session.pop(MFA_SETUP_SESSION_KEY, None)
        _mark_mfa_verified(request=request, user=user)
        return []
    TOTP.activate(user, secret)
    recovery = RecoveryCodes.activate(user)
    codes = recovery.get_unused_codes()
    request.session.pop(MFA_SETUP_SESSION_KEY, None)
    _mark_mfa_verified(request=request, user=user)
    audit.record(actor=user, action="account.mfa_enabled", entity_table="identity_user",
                 entity_id=user.id, scope={"program_id": str(user.program_id)})
    outbox.publish(SecurityNotificationRequested(user_id=user.id, action="mfa_enabled"))
    return codes


def verify_mfa(*, request, user: User, code: str) -> bool:
    authenticator = Authenticator.objects.filter(
        user=user, type=Authenticator.Type.TOTP,
    ).first()
    if authenticator and TOTP(authenticator).validate_code(code):
        authenticator.record_usage()
        _mark_mfa_verified(request=request, user=user)
        return True
    recovery_authenticator = Authenticator.objects.filter(
        user=user, type=Authenticator.Type.RECOVERY_CODES,
    ).first()
    if recovery_authenticator and RecoveryCodes(recovery_authenticator).validate_code(code):
        recovery_authenticator.record_usage()
        _mark_mfa_verified(request=request, user=user)
        return True
    audit.record(
        actor=user, action="account.mfa_failed",
        entity_table="identity_user", entity_id=user.id,
        scope={"program_id": str(user.program_id)},
    )
    return False


class MFAEnforcedSessionAuthentication(SessionAuthentication):
    """Keep password-authenticated sessions behind MFA for privileged roles."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if not result:
            return None
        user, _ = result
        if not session_is_valid(request=request, user=user):
            raise AuthenticationFailed("Session revoked or expired.")
        if mfa_required(user) and request.session.get(MFA_VERIFIED_SESSION_KEY) is not True:
            raise AuthenticationFailed("MFA verification required.")
        return result


def user_from_uid(value: str) -> User | None:
    try:
        return User.objects.get(pk=force_str(urlsafe_base64_decode(value)))
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return None


def change_password(*, user: User, current_password: str, new_password: str,
                    current_session_key: str | None = None) -> bool:
    if not user.check_password(current_password):
        return False
    user.set_password(new_password)
    user.password_reset_nonce = uuid.uuid4()
    user.save(update_fields=["password", "password_reset_nonce", "updated_at"])
    revoke_other_sessions(user=user, current_session_key=current_session_key)
    audit.record(actor=user, action="account.password_changed", entity_table="identity_user",
                 entity_id=user.id, scope={"program_id": str(user.program_id)})
    outbox.publish(SecurityNotificationRequested(user_id=user.id, action="password_changed"))
    return True
