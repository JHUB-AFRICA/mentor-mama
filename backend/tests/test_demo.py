import pytest
from django.core import mail
from django.core.management import call_command
from django.test import override_settings
from rest_framework.test import APIClient

from apps.identity.models import Program, Role, Status, User
from apps.mentorship.models import Session
from apps.placements.models import Placement

REAL_ADMIN = "presenter.admin@example.org"
REAL_STUDENT = "presenter.student@example.org"


@pytest.fixture
def seeded(db):
    call_command("seed_demo", admin_email=REAL_ADMIN, student_email=REAL_STUDENT, verbosity=0)
    return Program.objects.get(is_demo=True)


def test_seed_builds_every_lifecycle_state_and_rich_history(seeded):
    states = {}
    for placement in Placement.objects.filter(cohort__institution__program=seeded):
        states[placement.state] = states.get(placement.state, 0) + 1
    assert {"draft", "scheduled", "awaiting_student", "orientation", "induction", "active", "paused", "completed", "withdrawn"} <= set(states)
    assert Session.objects.filter(placement__cohort__institution__program=seeded).count() >= 60
    roles = {r: User.objects.filter(program=seeded, role=r).count() for r in Role.values if r != Role.PLATFORM_ADMIN}
    assert roles[Role.PROGRAM_ADMIN] == 1 and roles[Role.COORDINATOR] == 2 and roles[Role.NURSE_MANAGER] == 2
    assert roles[Role.MENTOR] == 5 and roles[Role.STUDENT] == 16
    assert not User.objects.filter(program=seeded, role=Role.PLATFORM_ADMIN).exists()


def test_seed_leaves_some_follow_ups_pending_and_some_done(seeded):
    from apps.mentorship import followups

    mentors = User.objects.filter(program=seeded, role=Role.MENTOR)
    totals = {"pending": 0, "done": 0}
    for mentor in mentors:
        counts = followups.counts(mentor)
        totals["pending"] += counts["pending"]
        totals["done"] += counts["done"]
    assert totals["pending"] > 0 and totals["done"] > 0


def test_only_the_two_chosen_people_have_real_addresses(seeded):
    real = set(User.objects.filter(program=seeded).exclude(email__endswith="@demo.sinapstechnology.tech").values_list("email", flat=True))
    assert real == {REAL_ADMIN, REAL_STUDENT}


def test_seeding_sends_no_email_and_creates_in_app_notifications(seeded):
    from apps.notifications.models import Notification

    assert mail.outbox == []
    assert Notification.objects.filter(user_id__in=User.objects.filter(program=seeded).values_list('id', flat=True)).count() > 20


def test_seeding_twice_needs_an_explicit_retire(seeded):
    from django.core.management.base import CommandError

    with pytest.raises(CommandError):
        call_command("seed_demo", verbosity=0)
    call_command("seed_demo", admin_email=REAL_ADMIN, student_email=REAL_STUDENT, retire_existing=True, verbosity=0)
    assert Program.objects.filter(is_demo=True).count() == 1
    assert User.objects.filter(email=REAL_ADMIN, program__is_demo=True, status=Status.ACTIVE).count() == 1


# ------------------------------------------------------------------ one-tap sign-in


def test_demo_sign_in_is_closed_unless_demo_mode_is_on(seeded):
    client = APIClient()
    assert client.get("/api/v1/auth/demo").json()["data"] == {"enabled": False, "accounts": []}
    assert client.post("/api/v1/auth/demo/login", {"role": "mentor"}, format="json").status_code == 404


@override_settings(DEMO_MODE=True)
def test_demo_mode_lists_five_roles_and_signs_in_without_mfa(seeded):
    client = APIClient()
    accounts = client.get("/api/v1/auth/demo").json()["data"]
    assert [a["role"] for a in accounts["accounts"]] == ["program_admin", "coordinator", "nurse_manager", "mentor", "student"]
    assert "password" not in str(accounts)
    for account in accounts["accounts"]:
        session = APIClient()
        login = session.post("/api/v1/auth/demo/login", {"role": account["role"]}, format="json")
        assert login.status_code == 200 and login.json()["data"]["email"] == account["email"]
        # A privileged call works at once: no MFA step for the demo programme.
        assert session.get("/api/v1/auth/session").json()["data"]["authenticated"] is True


@override_settings(DEMO_MODE=True)
def test_demo_mode_never_signs_in_platform_admins_or_unknown_roles_and_real_programmes_keep_mfa(seeded):
    client = APIClient()
    assert client.post("/api/v1/auth/demo/login", {"role": "platform_admin"}, format="json").status_code == 400
    from apps.identity.authentication import mfa_required

    real = Program.objects.create(name="Real programme")
    real_admin = User.objects.create_user("real@example.org", "pw", first_name="R", last_name="A", role=Role.PROGRAM_ADMIN, status=Status.ACTIVE, program=real)
    demo_admin = User.objects.get(email=REAL_ADMIN)
    assert mfa_required(real_admin) is True
    ops = User.objects.create_superuser("ops@example.test", "Mentor-Platform-2026!", first_name="O", last_name="P")
    assert mfa_required(ops) is True
    assert mfa_required(demo_admin) is False


def test_demo_accounts_keep_mfa_when_demo_mode_is_off(seeded):
    from apps.identity.authentication import mfa_required

    assert mfa_required(User.objects.get(email=REAL_ADMIN)) is True


# ------------------------------------------------------------------ email safety


@override_settings(
    EMAIL_BACKEND="apps.core.email_backend.SafeEmailBackend", EMAIL_DELEGATE_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEMO_EMAIL_ALLOWLIST=[REAL_ADMIN, REAL_STUDENT],
)
def test_email_to_demo_people_only_reaches_the_allowlisted_inboxes(seeded):
    from django.core.mail import send_mail

    stranger = User.objects.create_user("stranger@example.org", "pw", first_name="S", last_name="T", role=Role.PROGRAM_ADMIN, status=Status.INVITED, program=seeded)
    assert send_mail("Hello", "Body", None, [REAL_ADMIN]) == 1
    assert send_mail("Hello", "Body", None, [f"Someone <{REAL_STUDENT.split('@')[0]}+demo@example.org>"]) == 1  # plus-addressing
    assert send_mail("Hello", "Body", None, ["peter.njoroge@demo.sinapstechnology.tech"]) == 0
    assert send_mail("Hello", "Body", None, [stranger.email]) == 0  # a demo-programme person who is not allowlisted
    assert send_mail("Hello", "Body", None, ["anyone@example.net"]) == 1  # people outside the demo are unaffected
    assert send_mail("Hello", "Body", None, ["x@mentormama.test"]) == 0
    assert len(mail.outbox) == 3


@override_settings(
    EMAIL_BACKEND="apps.core.email_backend.SafeEmailBackend", EMAIL_DELEGATE_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEMO_EMAIL_ALLOWLIST=[REAL_ADMIN, REAL_STUDENT],
)
def test_live_demo_actions_email_the_real_student_only(seeded):
    """Pausing the real student's placement emails them; mentor and manager addresses are never emailed."""
    from apps.notifications.email import deliver_outbox_event
    from apps.placements import services as placement_services
    from apps.core.models import OutboxEvent

    student = User.objects.get(email=REAL_STUDENT)
    manager = User.objects.get(email="grace.muthoni@demo.sinapstechnology.tech")
    placement = Placement.objects.get(student_assignments__student=student)
    placement_services.pause(placement.id, actor=manager, reason="other", note="Demo pause")
    for event in OutboxEvent.objects.filter(dispatched_at=None, event_type="PlacementPaused"):
        deliver_outbox_event(event)
    recipients = {address for message in mail.outbox for address in message.to}
    assert recipients == {REAL_STUDENT}


def test_predeploy_seeds_the_demo_once_only_when_asked(db, monkeypatch):
    from django.core.management import call_command

    monkeypatch.delenv("PLATFORM_ADMIN_EMAIL", raising=False)
    call_command("predeploy", verbosity=0)
    assert not Program.objects.filter(is_demo=True).exists()  # off by default
    monkeypatch.setenv("DEMO_SEED", "true")
    monkeypatch.setenv("DEMO_ADMIN_EMAIL", REAL_ADMIN)
    monkeypatch.setenv("DEMO_STUDENT_EMAIL", REAL_STUDENT)
    call_command("predeploy", verbosity=0)
    first = Program.objects.get(is_demo=True)
    call_command("predeploy", verbosity=0)  # a later deploy leaves it alone
    assert Program.objects.get(is_demo=True).id == first.id and Program.objects.filter(is_demo=True).count() == 1
    assert User.objects.filter(email=REAL_ADMIN, program=first).exists()
    assert first.name == "Safe Motherhood Mentorship Programme"


def test_admin_has_a_setup_trail_in_their_activity_and_names_are_unique_and_fictional(seeded):
    from apps.core import selectors as core_selectors

    admin = User.objects.get(email=REAL_ADMIN)
    activity = core_selectors.program_activity(actor=admin, page=1, page_size=100)
    assert activity["pagination"]["total_count"] >= 30
    from apps.facilities.models import Facility
    from apps.institutions.models import Institution

    names = set(Facility.objects.filter(program=seeded).values_list("name", flat=True)) | set(Institution.objects.filter(program=seeded).values_list("name", flat=True))
    assert names == {"Greenville Referral Hospital", "Lakeview Maternity Hospital", "MentorMAMA School of Nursing", "Rosami College of Health Sciences"}
