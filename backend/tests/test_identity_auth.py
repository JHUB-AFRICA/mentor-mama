"""Contract tests for the first account-lifecycle slice."""

import pytest
from allauth.mfa.totp.internal.auth import (
    format_hotp_value,
    hotp_value,
    yield_hotp_counters_from_time,
)
from allauth.mfa.models import Authenticator
from allauth.mfa.totp.internal.auth import TOTP, generate_totp_secret
from django.core.management import call_command
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient

from apps.identity import authentication
from apps.identity.models import BootstrapEvent, Role, Status, User, UserSession


pytestmark = pytest.mark.django_db(transaction=True)


def uid(user):
    return urlsafe_base64_encode(force_bytes(str(user.id)))


def complete_totp_setup(client):
    setup = client.post("/api/v1/auth/mfa/setup", {}, format="json")
    secret = setup.json()["data"]["secret"]
    code = format_hotp_value(hotp_value(secret, next(iter(yield_hotp_counters_from_time()))))
    response = client.post("/api/v1/auth/mfa/setup/verify", {"code": code}, format="json")
    assert response.status_code == 200


def test_coordinator_can_invite_student_and_activation_is_single_use(coordinator, institution):
    invited = authentication.invite_user(
        actor=coordinator,
        email="new.student@jkuat.ac.ke",
        first_name="New",
        last_name="Student",
        role=Role.STUDENT,
        program_id=coordinator.program_id,
        institution_id=institution.id,
        registration_number="STU-2026-0001",
    )
    token = authentication.invitation_token(invited)
    client = APIClient()
    response = client.post("/api/v1/auth/activate", {
        "uid": uid(invited), "token": token, "password": "A-valid-password-123!",
    }, format="json")
    assert response.status_code == 201
    invited.refresh_from_db()
    assert invited.status == Status.ACTIVE
    assert client.get("/api/v1/me").status_code == 200

    replay = APIClient().post("/api/v1/auth/activate", {
        "uid": uid(invited), "token": token, "password": "Another-valid-password-123!",
    }, format="json")
    assert replay.status_code == 400


def test_login_logout_and_suspended_account_rejection(coordinator):
    coordinator.set_password("A-valid-password-123!")
    coordinator.save(update_fields=["password", "updated_at"])
    client = APIClient()
    response = client.post("/api/v1/auth/login", {
        "email": coordinator.email, "password": "A-valid-password-123!",
    }, format="json")
    assert response.status_code == 202
    complete_totp_setup(client)
    assert client.get("/api/v1/me").status_code == 200
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/me").status_code == 403

    wrong_password = APIClient().post("/api/v1/auth/login", {
        "email": coordinator.email, "password": "not-the-password",
    }, format="json")
    coordinator.status = Status.SUSPENDED
    coordinator.save(update_fields=["status", "updated_at"])
    suspended = APIClient().post("/api/v1/auth/login", {
        "email": coordinator.email, "password": "A-valid-password-123!",
    }, format="json")
    wrong_password_while_suspended = APIClient().post("/api/v1/auth/login", {
        "email": coordinator.email, "password": "not-the-password",
    }, format="json")
    assert wrong_password.status_code == wrong_password_while_suspended.status_code == 401
    assert wrong_password.json() == wrong_password_while_suspended.json()
    assert suspended.status_code == 403
    assert suspended.json()["error"]["code"] == "AccountSuspended"
    assert "password reset will not restore access" in suspended.json()["error"]["message"]
    assert "suspended" not in wrong_password.json()["error"]["message"].lower()


def test_session_probe_is_safe_for_signed_out_and_authenticated_clients(student):
    client = APIClient()
    signed_out = client.get("/api/v1/auth/session")
    assert signed_out.status_code == 200
    assert signed_out.json() == {"data": {"authenticated": False, "user": None}}

    student.set_password("A-valid-password-123!")
    student.save(update_fields=["password", "updated_at"])
    assert client.post("/api/v1/auth/login", {
        "email": student.email, "password": "A-valid-password-123!",
    }, format="json").status_code == 200
    signed_in = client.get("/api/v1/auth/session")
    assert signed_in.status_code == 200
    assert signed_in.json()["data"]["authenticated"] is True
    assert signed_in.json()["data"]["user"]["id"] == str(student.id)


def test_session_probe_does_not_reject_mfa_pending_session(coordinator):
    coordinator.set_password("A-valid-password-123!")
    coordinator.save(update_fields=["password", "updated_at"])
    client = APIClient()
    login_response = client.post("/api/v1/auth/login", {
        "email": coordinator.email, "password": "A-valid-password-123!",
    }, format="json")
    assert login_response.status_code == 202

    csrf = client.get("/api/v1/auth/csrf")
    assert csrf.status_code == 200
    probe = client.get("/api/v1/auth/session")
    assert probe.status_code == 200
    assert probe.json() == {"data": {"authenticated": False, "user": None}}


def test_password_reset_response_does_not_enumerate_accounts(student):
    student.set_password("A-valid-password-123!")
    student.save(update_fields=["password", "updated_at"])
    client = APIClient()
    known = client.post("/api/v1/auth/password-reset/request", {"email": student.email}, format="json")
    unknown = client.post("/api/v1/auth/password-reset/request", {"email": "missing@example.com"}, format="json")
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json() == {"data": {"accepted": True}}


def test_password_change_rotates_auth_hash(coordinator):
    coordinator.set_password("A-valid-password-123!")
    coordinator.save(update_fields=["password", "updated_at"])
    client = APIClient()
    client.post("/api/v1/auth/login", {"email": coordinator.email, "password": "A-valid-password-123!"}, format="json")
    complete_totp_setup(client)
    response = client.post("/api/v1/auth/password-change", {
        "current_password": "A-valid-password-123!", "new_password": "A-new-valid-password-123!",
    }, format="json")
    assert response.status_code == 200
    assert client.get("/api/v1/me").status_code == 200
    assert APIClient().post("/api/v1/auth/login", {
        "email": coordinator.email, "password": "A-valid-password-123!",
    }, format="json").status_code == 401


def test_bootstrap_program_admin_is_idempotent(db):
    call_command(
        "bootstrap_program_admin",
        program_name="MentorMAMA Bootstrap Test",
        email="first.admin@example.com",
        first_name="First",
        last_name="Admin",
    )
    call_command(
        "bootstrap_program_admin",
        program_name="MentorMAMA Bootstrap Test",
        email="first.admin@example.com",
        first_name="First",
        last_name="Admin",
    )
    assert User.objects.filter(role=Role.PROGRAM_ADMIN).count() == 1
    assert BootstrapEvent.objects.filter(action="initial_program_admin_invited").count() == 1


def test_privileged_login_requires_totp_and_returns_recovery_codes(coordinator):
    coordinator.set_password("A-valid-password-123!")
    coordinator.save(update_fields=["password", "updated_at"])
    client = APIClient()
    login_response = client.post("/api/v1/auth/login", {
        "email": coordinator.email, "password": "A-valid-password-123!",
    }, format="json")
    assert login_response.status_code == 202
    assert login_response.json()["data"] == {
        "mfa_required": True, "mfa_setup_required": True,
        "email_mfa_available": False,
        "recovery_contact": "programme_admin",
    }

    setup = client.post("/api/v1/auth/mfa/setup", {}, format="json")
    assert setup.status_code == 200
    secret = setup.json()["data"]["secret"]
    counter = next(iter(yield_hotp_counters_from_time()))
    code = format_hotp_value(hotp_value(secret, counter))
    verified = client.post("/api/v1/auth/mfa/setup/verify", {"code": code}, format="json")
    assert verified.status_code == 200
    assert len(verified.json()["data"]["recovery_codes"]) == 10
    assert client.get("/api/v1/me").status_code == 200


def test_student_can_opt_in_to_totp_mfa(student):
    client = APIClient()
    client.force_authenticate(student)

    response = client.post("/api/v1/auth/mfa/setup", {}, format="json")

    assert response.status_code == 200
    assert response.json()["data"]["otpauth_uri"].startswith("otpauth://totp/")


def test_user_can_inventory_and_revoke_other_sessions(student):
    student.set_password("A-valid-password-123!")
    student.save(update_fields=["password", "updated_at"])
    first = APIClient()
    second = APIClient()
    payload = {"email": student.email, "password": "A-valid-password-123!"}
    assert first.post("/api/v1/auth/login", payload, format="json").status_code == 200
    assert second.post("/api/v1/auth/login", payload, format="json").status_code == 200

    sessions = first.get("/api/v1/auth/sessions")
    assert sessions.status_code == 200
    assert len(sessions.json()["data"]) == 2
    assert first.post("/api/v1/auth/sessions/revoke-others", {}, format="json").json() == {"data": {"revoked": 1}}
    assert second.get("/api/v1/me").status_code in {401, 403}
    assert first.get("/api/v1/me").status_code == 200


def test_coordinator_suspension_revokes_student_sessions(coordinator, student):
    student.set_password("A-valid-password-123!")
    student.save(update_fields=["password", "updated_at"])
    client = APIClient()
    assert client.post("/api/v1/auth/login", {
        "email": student.email, "password": "A-valid-password-123!",
    }, format="json").status_code == 200
    session = UserSession.objects.get(user=student)

    changed = authentication.change_status(
        actor=coordinator, target=student, status=Status.SUSPENDED, reason="Placement paused",
    )
    assert changed.status == Status.SUSPENDED
    session.refresh_from_db()
    assert session.revoked_at is not None
    assert client.get("/api/v1/me").status_code in {401, 403}


def test_password_reset_revokes_existing_sessions(student):
    student.set_password("A-valid-password-123!")
    student.save(update_fields=["password", "updated_at"])
    client = APIClient()
    assert client.post("/api/v1/auth/login", {
        "email": student.email, "password": "A-valid-password-123!",
    }, format="json").status_code == 200
    token = authentication.password_reset_tokens.make_token(student)
    assert authentication.reset_password(
        user=student, token=token, password="A-new-valid-password-123!",
    )
    assert client.get("/api/v1/me").status_code in {401, 403}


def test_program_admin_may_perform_audited_mfa_recovery(coordinator, program):
    TOTP.activate(coordinator, generate_totp_secret())
    admin = User.objects.create_user(
        email="admin@mentormama.test", password="A-valid-password-123!",
        first_name="Programme", last_name="Admin", role=Role.PROGRAM_ADMIN,
        status=Status.ACTIVE, program=program,
    )
    assert authentication.recover_mfa(
        actor=admin, target=coordinator, reason="User lost authenticator device",
    )
    assert not Authenticator.objects.filter(user=coordinator).exists()


def test_program_admin_cannot_activate_pending_invitation_directly(coordinator, program):
    admin = User.objects.create_user(
        email="admin-status@mentormama.test", password="A-valid-password-123!",
        first_name="Programme", last_name="Admin", role=Role.PROGRAM_ADMIN,
        status=Status.ACTIVE, program=program,
    )
    invited = authentication.invite_user(
        actor=admin, email="pending@mentormama.test", first_name="Pending",
        last_name="Person", role=Role.COORDINATOR, program_id=program.id,
        institution_id=coordinator.institution_id,
    )
    assert not authentication.change_status(
        actor=admin, target=invited, status=Status.ACTIVE, reason="Should use invite flow",
    )
    assert invited.status == Status.INVITED
    assert not invited.has_usable_password()


def test_invitation_token_is_bound_to_role_and_scope(coordinator, program):
    token = authentication.invitation_token(coordinator)
    coordinator.role = Role.PROGRAM_ADMIN
    coordinator.institution_id = None
    coordinator.save(update_fields=["role", "institution_id", "updated_at"])
    assert not authentication.invitation_tokens.check_token(coordinator, token)


def test_admin_can_reissue_deactivated_unaccepted_invitation(coordinator, program):
    admin = User.objects.create_user(
        email="admin-reissue@mentormama.test", password="A-valid-password-123!",
        first_name="Programme", last_name="Admin", role=Role.PROGRAM_ADMIN,
        status=Status.ACTIVE, program=program,
    )
    invited = authentication.invite_user(
        actor=admin, email="reissue@mentormama.test", first_name="Reissue",
        last_name="Person", role=Role.COORDINATOR, program_id=program.id,
        institution_id=coordinator.institution_id,
    )
    old_token = authentication.invitation_token(invited)
    invited.status = Status.DEACTIVATED
    invited.save(update_fields=["status", "updated_at"])
    assert authentication.resend_invitation(actor=admin, target=invited)
    invited.refresh_from_db()
    assert invited.status == Status.INVITED
    assert not authentication.invitation_tokens.check_token(invited, old_token)


def test_admin_recovery_request_review_is_scoped_and_audited(coordinator, program):
    from apps.identity.models import MFARecoveryRequest
    admin = User.objects.create_user(
        email="admin-review@mentormama.test", password="A-valid-password-123!",
        first_name="Programme", last_name="Admin", role=Role.PROGRAM_ADMIN,
        status=Status.ACTIVE, program=program,
    )
    record = authentication.create_mfa_recovery_request(
        user=coordinator, reason="I lost access to my authenticator device",
    )
    assert record.status == MFARecoveryRequest.Status.PENDING
    assert authentication.review_mfa_recovery_request(
        actor=admin, request_id=record.id, decision="close", reason="Verified with the user",
    )
    record.refresh_from_db()
    assert record.status == MFARecoveryRequest.Status.REVIEWED
    from apps.core.models import AuditEntry
    assert AuditEntry.objects.filter(entity_id=coordinator.id, action="account.mfa_recovery_request_reviewed", override_reason="Verified with the user").exists()
