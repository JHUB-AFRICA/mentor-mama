import uuid

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.core.models import OutboxEvent
from apps.identity.models import BootstrapEvent, MFARecoveryRequest, Program, Role, Status, User

STRONG = "Mentor-Platform-2026!"


def _headers():
    return {"HTTP_IDEMPOTENCY_KEY": str(uuid.uuid4())}


@pytest.fixture
def platform_admin(db):
    return User.objects.create_superuser("ops@example.test", STRONG, first_name="Ops", last_name="Admin")


@pytest.fixture
def ops(platform_admin):
    client = APIClient()
    client.force_authenticate(platform_admin)
    return client


@pytest.fixture
def programme_admin(program):
    return User.objects.create_user("padmin@example.test", STRONG, first_name="Pat", last_name="Admin",
                                    role=Role.PROGRAM_ADMIN, status=Status.ACTIVE, program=program)


# ------------------------------------------------------------------ deploy-time bootstrap

def test_bootstrap_creates_an_active_superuser_without_email_and_never_touches_it_again(db, monkeypatch):
    monkeypatch.setenv("PLATFORM_ADMIN_EMAIL", "Admin@Example.test")
    monkeypatch.setenv("PLATFORM_ADMIN_INITIAL_PASSWORD", STRONG)
    before = OutboxEvent.objects.count()
    call_command("ensure_platform_admin")
    user = User.objects.get(email="admin@example.test")
    assert user.role == Role.PLATFORM_ADMIN and user.status == Status.ACTIVE and user.program_id is None
    assert user.is_superuser and user.is_staff and user.must_change_password and user.check_password(STRONG)
    assert OutboxEvent.objects.count() == before  # no invitation email
    assert BootstrapEvent.objects.filter(email="admin@example.test", action="initial_platform_admin_created").exists()

    # A later deploy with a different password leaves the account alone.
    user.set_password("Changed-By-Owner-99!")
    user.must_change_password = False
    user.save()
    monkeypatch.setenv("PLATFORM_ADMIN_INITIAL_PASSWORD", "Another-Password-2026!")
    call_command("ensure_platform_admin")
    user.refresh_from_db()
    assert user.check_password("Changed-By-Owner-99!") and not user.must_change_password


def test_bootstrap_skips_without_config_weak_passwords_and_other_accounts(db, monkeypatch, programme_admin):
    monkeypatch.delenv("PLATFORM_ADMIN_EMAIL", raising=False)
    call_command("ensure_platform_admin")
    monkeypatch.setenv("PLATFORM_ADMIN_EMAIL", "weak@example.test")
    monkeypatch.setenv("PLATFORM_ADMIN_INITIAL_PASSWORD", "password")
    call_command("ensure_platform_admin")
    monkeypatch.setenv("PLATFORM_ADMIN_EMAIL", programme_admin.email)
    monkeypatch.setenv("PLATFORM_ADMIN_INITIAL_PASSWORD", STRONG)
    call_command("ensure_platform_admin")
    assert not User.objects.filter(role=Role.PLATFORM_ADMIN).exists()
    programme_admin.refresh_from_db()
    assert programme_admin.role == Role.PROGRAM_ADMIN


def test_constraint_keeps_platform_admins_outside_programmes(program):
    from django.db import IntegrityError, transaction

    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.create_user("x@example.test", STRONG, first_name="X", last_name="Y", role=Role.PLATFORM_ADMIN, program=program)
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.create_user("y@example.test", STRONG, first_name="X", last_name="Y", role=Role.PROGRAM_ADMIN, program=None)


# ------------------------------------------------------------------ separate sign-in

def test_platform_admins_sign_in_only_at_the_platform_page_and_need_mfa(platform_admin, programme_admin):
    client = APIClient()
    workspace = client.post("/api/v1/auth/login", {"email": platform_admin.email, "password": STRONG}, format="json")
    assert workspace.status_code == 403 and workspace.json()["error"]["code"] == "UsePlatformSignIn"
    wrong_page = client.post("/api/v1/auth/login", {"email": programme_admin.email, "password": STRONG, "portal": "platform"}, format="json")
    assert wrong_page.status_code == 403 and wrong_page.json()["error"]["code"] == "NotPlatformAccount"
    # A wrong password reveals nothing about which page an account uses.
    bad = client.post("/api/v1/auth/login", {"email": platform_admin.email, "password": "nope", "portal": "workspace"}, format="json")
    assert bad.status_code == 401
    ok = client.post("/api/v1/auth/login", {"email": platform_admin.email, "password": STRONG, "portal": "platform"}, format="json")
    assert ok.status_code == 202 and ok.json()["data"]["mfa_required"] is True and ok.json()["data"]["mfa_setup_required"] is True
    assert ok.json()["data"]["recovery_contact"] == "support"
    # Until MFA is complete the platform API stays closed.
    assert client.get("/api/v1/platform/overview").status_code in {401, 403}


def test_initial_password_must_be_changed_before_any_change_can_be_made(platform_admin, ops):
    platform_admin.must_change_password = True
    platform_admin.save()
    assert ops.get("/api/v1/platform/overview").status_code == 200
    blocked = ops.get("/api/v1/platform/accounts")
    assert blocked.status_code == 403 and blocked.json()["error"]["code"] == "PasswordChangeRequired"
    session = ops.get("/api/v1/me")
    assert session.status_code == 200
    changed = ops.post("/api/v1/auth/password-change", {"current_password": STRONG, "new_password": "A-Brand-New-Pass-77!"}, format="json")
    assert changed.status_code in {200, 204}, changed.content
    platform_admin.refresh_from_db()
    assert not platform_admin.must_change_password
    assert ops.get("/api/v1/platform/accounts").status_code == 200


def test_other_roles_cannot_use_the_platform_api(programme_admin):
    client = APIClient()
    client.force_authenticate(programme_admin)
    for path in ("/api/v1/platform/overview", "/api/v1/platform/accounts", "/api/v1/platform/programmes"):
        assert client.get(path).status_code == 403


# ------------------------------------------------------------------ programmes and invitations

def test_platform_creates_a_programme_and_invites_its_first_admin(ops):
    before = OutboxEvent.objects.filter(event_type="IdentityInvitationRequested").count()
    created = ops.post("/api/v1/platform/programmes", {
        "name": "KMTC Pilot", "academic_year": "2026/27",
        "admin": {"email": "lead@kmtc.example", "first_name": "Lena", "last_name": "Lead"}}, format="json", **_headers())
    assert created.status_code == 201, created.content
    programme = Program.objects.get(name="KMTC Pilot")
    admin = User.objects.get(email="lead@kmtc.example")
    assert admin.role == Role.PROGRAM_ADMIN and admin.program_id == programme.id and admin.status == Status.INVITED
    assert OutboxEvent.objects.filter(event_type="IdentityInvitationRequested").count() == before + 1
    from apps.induction.models import ChecklistTemplate

    assert ChecklistTemplate.objects.filter(program=programme).exists()  # ready for inductions straight away
    assert ops.post("/api/v1/platform/programmes", {"name": "kmtc pilot"}, format="json", **_headers()).status_code == 400
    rows = {row["name"]: row for row in ops.get("/api/v1/platform/programmes").json()["data"]}
    assert rows["KMTC Pilot"]["invited_admins"] == 1
    # A second administrator for an existing programme.
    again = ops.post(f"/api/v1/platform/programmes/{programme.id}/admins",
                     {"email": "second@kmtc.example", "first_name": "Sam", "last_name": "Second"}, format="json", **_headers())
    assert again.status_code == 202


def test_programme_admins_can_never_create_or_act_on_platform_accounts(platform_admin, programme_admin, program):
    from apps.core.errors import UnauthorizedFacilityAccess
    from apps.identity import authentication

    with pytest.raises(UnauthorizedFacilityAccess):
        authentication.invite_user(actor=programme_admin, email="sneaky@example.test", first_name="S", last_name="N",
                                   role=Role.PLATFORM_ADMIN, program_id=None)
    assert authentication.change_status(actor=programme_admin, target=platform_admin, status=Status.SUSPENDED, reason="Testing it") is None
    assert authentication.revoke_account_sessions(actor=programme_admin, target=platform_admin, reason="Testing it") is None
    # The platform cannot invite coordinators or mentors directly; programme admins do that.
    with pytest.raises(UnauthorizedFacilityAccess):
        authentication.invite_user(actor=platform_admin, email="c@example.test", first_name="C", last_name="O",
                                   role=Role.COORDINATOR, program_id=program.id)


# ------------------------------------------------------------------ accounts and support

def test_accounts_search_status_sessions_and_resend(ops, platform_admin, programme_admin, program):
    invited = User.objects.create_user("waiting@example.test", None, first_name="Wai", last_name="Ting",
                                       role=Role.PROGRAM_ADMIN, status=Status.INVITED, program=program)
    invited.set_unusable_password()
    invited.save()
    page = ops.get("/api/v1/platform/accounts?search=pat").json()["data"]
    assert [row["email"] for row in page["results"]] == [programme_admin.email]
    assert page["results"][0]["programme"] == program.name
    platform_rows = ops.get("/api/v1/platform/accounts?programme_id=platform").json()["data"]["results"]
    assert [row["email"] for row in platform_rows] == [platform_admin.email]
    assert ops.get("/api/v1/platform/accounts?invitation=expired").json()["data"]["results"][0]["email"] == invited.email

    assert ops.post(f"/api/v1/platform/accounts/{programme_admin.id}/status", {"status": "suspended", "reason": "Left the programme"}, format="json").status_code == 200
    programme_admin.refresh_from_db()
    assert programme_admin.status == Status.SUSPENDED
    assert ops.post(f"/api/v1/platform/accounts/{platform_admin.id}/status", {"status": "suspended", "reason": "Self harm test"}, format="json").status_code == 409
    assert ops.post(f"/api/v1/platform/accounts/{programme_admin.id}/status", {"status": "active", "reason": "Returned to the programme"}, format="json").status_code == 200
    assert ops.post(f"/api/v1/platform/accounts/{programme_admin.id}/sessions/revoke", {"reason": "Lost laptop"}, format="json").status_code == 200
    assert ops.post(f"/api/v1/platform/accounts/{invited.id}/invitation/resend", {}, format="json").status_code == 200
    titles = [row["title"] for row in ops.get("/api/v1/platform/activity").json()["data"]]
    assert "Changed account status" in titles and "Resent an invitation" in titles


def test_support_requests_from_lone_programme_admins_are_resolved_by_the_platform(ops, programme_admin):
    record = MFARecoveryRequest.objects.create(user=programme_admin, reason="Lost my phone")
    rows = ops.get("/api/v1/platform/support-requests").json()["data"]
    assert rows[0]["id"] == str(record.id) and rows[0]["handled_by"] == "platform"
    resolved = ops.post(f"/api/v1/platform/support-requests/{record.id}/resolve", {"decision": "recover", "reason": "Identity checked by phone"}, format="json")
    assert resolved.status_code == 200
    record.refresh_from_db()
    assert record.status == MFARecoveryRequest.Status.REVIEWED
    assert ops.post(f"/api/v1/platform/support-requests/{record.id}/resolve", {"decision": "close", "reason": "Second time"}, format="json").status_code == 409


def test_overview_reports_counts_and_system_checks(ops, programme_admin):
    data = ops.get("/api/v1/platform/overview").json()["data"]
    assert data["programmes"] >= 1 and data["accounts"]["active"] >= 2
    names = {check["name"] for check in data["system"]["checks"]}
    assert {"Database", "Cache", "Background jobs", "Email", "File storage", "AI assistant"} <= names
    assert next(c for c in data["system"]["checks"] if c["name"] == "Database")["state"] == "ok"


# ------------------------------------------------------------------ fixes found on the deployed system

def _png():
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "teal").save(buffer, "PNG")
    buffer.seek(0)
    buffer.name = "logo.png"
    return buffer


def test_programme_admin_can_create_a_facility_and_institution_with_a_logo(programme_admin, settings):
    """Logos used to be written to MEDIA_ROOT, which is not writable (or served) in the production image."""
    from django.conf import settings as live

    private_root = live.PRIVATE_CONTENT_ROOT
    settings.MEDIA_ROOT = "/nonexistent-read-only-media"
    client = APIClient()
    client.force_authenticate(programme_admin)
    for path, extra in (("/api/v1/facilities", {"level": "Level 6"}), ("/api/v1/institutions", {"type": "University"})):
        created = client.post(path, {"name": "Partner with logo", "logo": _png(), **extra}, format="multipart", **_headers())
        assert created.status_code == 201, created.content
        logo_url = created.json()["data"]["logo_url"]
        assert logo_url.startswith(f"{path}/") and "/logo" in logo_url
        served = client.get(logo_url)
        assert served.status_code == 200 and served["Content-Type"] == "image/png"
        assert APIClient().get(logo_url).status_code in {401, 403}
    from apps.facilities.models import Facility
    from apps.institutions.models import Institution

    for model in (Facility, Institution):
        stored = model.objects.get(name="Partner with logo").logo
        assert str(stored.storage.location) == str(private_root) and stored.storage.exists(stored.name)


def test_validation_errors_carry_a_readable_message(programme_admin):
    client = APIClient()
    client.force_authenticate(programme_admin)
    bad = client.post("/api/v1/facilities", {"name": "X", "contact_email": "not-an-email"}, format="json", **_headers())
    body = bad.json()
    assert bad.status_code == 400 and "name" in body  # DRF field details are kept
    assert body["error"]["code"] == "ValidationError" and body["error"]["message"].startswith("Name:")


def test_password_change_explains_rejections_and_returns_the_updated_account(platform_admin, ops):
    platform_admin.must_change_password = True
    platform_admin.save()
    weak = ops.post("/api/v1/auth/password-change", {"current_password": STRONG, "new_password": "password1234"}, format="json")
    assert weak.status_code == 400 and "New password:" in weak.json()["error"]["message"]
    same = ops.post("/api/v1/auth/password-change", {"current_password": STRONG, "new_password": STRONG}, format="json")
    assert same.status_code == 400 and "different" in same.json()["error"]["message"]
    ok = ops.post("/api/v1/auth/password-change", {"current_password": STRONG, "new_password": "Brand-New-Pass-2026!"}, format="json")
    assert ok.status_code == 200 and ok.json()["data"]["user"]["must_change_password"] is False
    assert ops.get("/api/v1/platform/accounts").status_code == 200
