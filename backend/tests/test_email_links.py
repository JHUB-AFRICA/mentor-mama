"""No email may carry a link to localhost in production, and a misconfiguration must be visible, not silent."""

import pytest
from django.core import mail
from django.core.exceptions import ImproperlyConfigured
from django.test import override_settings

from apps.core import links
from apps.platform import enquiries

PORTAL = "https://app.example.org"
WEBSITE = "https://www.example.org"


@pytest.mark.parametrize("base", ["", "http://localhost:5173", "http://127.0.0.1:8000", "http://0.0.0.0", "https://dev.local", "http://192.168.1.5:5173", "http://10.0.0.4"])
def test_local_addresses_are_recognised(base):
    assert links.is_local(base)


@pytest.mark.parametrize("base", ["https://mentormama-portal.onrender.com", "https://app.example.org/", "https://sinapstechnology.tech"])
def test_public_addresses_are_not_local(base):
    assert not links.is_local(base)


@override_settings(LINKS_MUST_BE_PUBLIC=True, FRONTEND_BASE_URL="http://localhost:5173", WEBSITE_BASE_URL="")
def test_production_refuses_to_build_a_localhost_portal_link_and_omits_the_website_link():
    with pytest.raises(ImproperlyConfigured):
        links.portal_url("/activate")
    assert links.website_url("/status") is None


@override_settings(LINKS_MUST_BE_PUBLIC=False, FRONTEND_BASE_URL="http://localhost:5173", WEBSITE_BASE_URL="http://localhost:5173")
def test_development_keeps_local_links():
    assert links.portal_url("/x") == "http://localhost:5173/x"
    assert links.website_url("/status") == "http://localhost:5173/status"


@override_settings(LINKS_MUST_BE_PUBLIC=True, FRONTEND_BASE_URL=PORTAL, WEBSITE_BASE_URL=WEBSITE)
def test_every_enquiry_email_uses_the_public_addresses(db):
    from apps.identity.models import User

    admin = User.objects.create_superuser("ops@example.test", "Mentor-Platform-2026!", first_name="Ops", last_name="Admin")
    enquiry, _ = enquiries.submit(kind="support", topic="sign_in", name="Amina", email="amina@example.org", message="I cannot sign in today, please help.")
    enquiries.reply(actor=admin, enquiry=enquiry, body="Thanks Amina, we are looking into it.")
    enquiries.set_status(actor=admin, enquiry=enquiry, status="resolved")
    enquiries.send_pending_emails()
    assert len(mail.outbox) >= 4
    for message in mail.outbox:
        assert "localhost" not in message.body and "127.0.0.1" not in message.body, message.subject
    sender_mail = [m for m in mail.outbox if "amina@example.org" in m.to]
    assert all(f"{WEBSITE}/status" in m.body for m in sender_mail)
    assert any(f"{PORTAL}/platform/messages/{enquiry.id}" in m.body for m in mail.outbox if "ops@example.test" in m.to)


@override_settings(LINKS_MUST_BE_PUBLIC=True, FRONTEND_BASE_URL=PORTAL, WEBSITE_BASE_URL="")
def test_without_a_website_address_sender_emails_just_leave_the_progress_link_out(db):
    enquiries.submit(kind="contact", topic="general", name="Amina", email="amina@example.org", message="A general question about the pilot.")
    enquiries.send_pending_emails()
    body = [m for m in mail.outbox if "amina@example.org" in m.to][0].body
    assert "localhost" not in body and "Check progress" not in body and "Your reference:" in body


@override_settings(LINKS_MUST_BE_PUBLIC=True, FRONTEND_BASE_URL=PORTAL, WEBSITE_BASE_URL=WEBSITE)
def test_invitation_and_reset_links_use_the_portal_address(db, program):
    from apps.identity.models import Role, Status, User
    from apps.notifications.email import _activation_link, _reset_link

    user = User.objects.create_user("new@example.org", "pw", first_name="N", last_name="U", role=Role.PROGRAM_ADMIN, status=Status.INVITED, program=program)
    assert _activation_link(user).startswith(f"{PORTAL}/activate?uid=")
    assert _reset_link(user).startswith(f"{PORTAL}/reset-password?uid=")


@override_settings(LINKS_MUST_BE_PUBLIC=True, FRONTEND_BASE_URL="http://localhost:5173")
def test_a_misconfigured_portal_address_is_reported_by_the_system_check_and_the_status_page():
    from apps.core.checks import public_links_check
    from apps.platform.status import _links

    assert {w.id for w in public_links_check(None)} >= {"core.W001"}
    assert _links()[0] == "down"


@override_settings(LINKS_MUST_BE_PUBLIC=True, FRONTEND_BASE_URL=PORTAL, WEBSITE_BASE_URL=WEBSITE)
def test_a_correct_configuration_is_clean():
    from apps.core.checks import public_links_check
    from apps.platform.status import _links

    assert public_links_check(None) == [] and _links()[0] == "ok"


def test_production_settings_never_default_to_localhost():
    """Load the real production settings in a separate process (they modify shared settings lists) with only the minimum
    variables: the portal address is derived from the trusted origin and the website address is never localhost."""
    import json
    import os
    import subprocess
    import sys
    from pathlib import Path

    env = {k: v for k, v in os.environ.items() if k not in {"DJANGO_SETTINGS_MODULE"}}
    # A development value left in the environment must not leak into production links either.
    env.update(SECRET_KEY="x" * 50, ALLOWED_HOSTS="api.example.org", CSRF_TRUSTED_ORIGINS="https://portal.example.org",
               DATABASE_URL="postgres://u:p@127.0.0.1:5432/db", FRONTEND_BASE_URL="http://localhost:5173",
               WEBSITE_BASE_URL="http://localhost:5173", PORTAL_DOMAIN="")
    code = ("import json; from config.settings import prod; "
            "print(json.dumps([prod.LINKS_MUST_BE_PUBLIC, prod.FRONTEND_BASE_URL, prod.WEBSITE_BASE_URL]))")
    out = subprocess.run([sys.executable, "-c", code], cwd=Path(__file__).resolve().parent.parent, env=env, capture_output=True, text=True, check=True)
    assert json.loads(out.stdout.strip().splitlines()[-1]) == [True, "https://portal.example.org", ""]
