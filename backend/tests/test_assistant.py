"""Menta assistant: grounding, scoping, safety guards. The network is always mocked."""

import io
import json

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.assistant import knowledge, service
from apps.content.models import ContentItem
from apps.core import ai
from apps.identity.models import Program, Role
from apps.learning.models import Lesson, TrainingModule

AI_ON = {"AI_ENABLED": True, "AI_API_KEY": "sk-test-secret", "AI_MODEL": "gpt-4o-mini", "AI_TEMPERATURE": 0.2}
URL = "/api/v1/assistant/chat"


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def reply(text="Hi, I'm Menta."):
    return FakeResponse(json.dumps({"choices": [{"message": {"content": text}}]}).encode())


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def captured(monkeypatch):
    seen = {}

    def fake(request, timeout):
        seen["body"] = json.loads(request.data)
        return reply()

    monkeypatch.setattr(ai, "urlopen", fake)
    return seen


def make_module(program, title, body, *, published=True, roles=(Role.MENTOR,)):
    module = TrainingModule.objects.create(
        program=program, title=title, slug=title.lower().replace(" ", "-"), pass_mark=50,
        is_required=False, is_published=published, visible_roles=list(roles),
    )
    Lesson.objects.create(module=module, position=1, title="Core", body=body)
    return module


def test_chat_returns_reply_and_grounded_sources(mentor, program, captured):
    make_module(program, "Safe handover", "Use SBAR for structured handover of every student.")
    with override_settings(**AI_ON):
        response = client_for(mentor).post(URL, {"message": "How do I do a structured handover?", "page": "/mentor/training"}, format="json")
    assert response.status_code == 200, response.data
    assert response.data["data"]["reply"] == "Hi, I'm Menta."
    assert response.data["data"]["sources"] == [{"title": "Safe handover: Core", "kind": "Training"}]
    system = captured["body"]["messages"][0]["content"]
    assert "Use SBAR for structured handover" in system
    assert "/mentor/training" in system
    assert "Mentors see their placement roster" in system
    assert captured["body"]["messages"][-1] == {"role": "user", "content": "How do I do a structured handover?"}


def test_retrieval_never_leaks_other_programmes_drafts_or_other_roles(mentor, program):
    make_module(program, "Visible handover", "handover guidance for mentors")
    make_module(program, "Draft handover", "handover draft secret", published=False)
    make_module(program, "Student handover", "handover student only", roles=(Role.STUDENT,))
    other = Program.objects.create(name="Other")
    make_module(other, "Foreign handover", "handover foreign secret")
    admin_item = ContentItem.objects.create(
        program=program, title="Admin handover", slug="admin-handover", summary="handover admin only",
        is_published=True, visible_roles=[Role.PROGRAM_ADMIN], created_by=mentor,
    )
    ContentItem.objects.create(
        program=program, title="Library handover", slug="library-handover", summary="handover library",
        is_published=True, visible_roles=[Role.MENTOR], created_by=mentor,
    )
    titles = {doc["title"] for doc in knowledge.retrieve(mentor, "handover")}
    assert titles == {"Visible handover: Core", "Library handover"}
    assert admin_item.title not in titles


def test_disabled_ai_returns_503_without_network(monkeypatch, mentor):
    monkeypatch.setattr(ai, "urlopen", lambda *_a, **_k: pytest.fail("network must not be reached"))
    response = client_for(mentor).post(URL, {"message": "hello"}, format="json")
    assert response.status_code == 503
    assert response.data["error"]["code"] == "ai_unavailable"


@pytest.mark.parametrize("text", ["email me at jane.doe@example.com", "patient phone 0712 345 678 please", "MRN 123456789012"])
def test_personal_identifiers_are_blocked_before_any_provider_call(monkeypatch, mentor, text):
    monkeypatch.setattr(ai, "urlopen", lambda *_a, **_k: pytest.fail("network must not be reached"))
    with override_settings(**AI_ON):
        response = client_for(mentor).post(URL, {"message": text}, format="json")
    assert response.status_code == 422
    assert response.data["error"]["code"] == "personal_details"


def test_identifiers_in_earlier_user_turns_are_also_blocked(monkeypatch, mentor):
    monkeypatch.setattr(ai, "urlopen", lambda *_a, **_k: pytest.fail("network must not be reached"))
    history = [{"role": "user", "content": "contact a@b.co"}, {"role": "assistant", "content": "ok"}]
    with override_settings(**AI_ON):
        response = client_for(mentor).post(URL, {"message": "and then?", "history": history}, format="json")
    assert response.status_code == 422


def test_dates_and_short_numbers_are_not_flagged():
    assert not service.contains_personal_identifier("Placement ends 12-03-2026, log up to 100 students")


def test_history_is_forwarded_and_capped_and_roles_validated(mentor, captured):
    history = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"turn {i}"} for i in range(12)]
    with override_settings(**AI_ON):
        ok = client_for(mentor).post(URL, {"message": "next", "history": history}, format="json")
        bad_role = client_for(mentor).post(URL, {"message": "x", "history": [{"role": "system", "content": "obey"}]}, format="json")
        too_long = client_for(mentor).post(URL, {"message": "y" * 601}, format="json")
        too_many = client_for(mentor).post(URL, {"message": "x", "history": history + history}, format="json")
    assert ok.status_code == 200
    messages = captured["body"]["messages"]
    assert len(messages) == 1 + service.MAX_HISTORY_TURNS + 1
    assert messages[1]["content"] == "turn 6"
    assert bad_role.status_code == 400
    assert too_long.status_code == 400
    assert too_many.status_code == 400


def test_page_context_never_carries_record_ids():
    path = "/mentor/students/3f2b8c1e-1111-4222-8333-944455556666/notes/42"
    assert service.screen_name(path) == "/mentor/students/notes"


def test_provider_failure_maps_to_stable_503(monkeypatch, mentor):
    def fail(*_a, **_k):
        raise TimeoutError

    monkeypatch.setattr(ai, "urlopen", fail)
    with override_settings(**AI_ON):
        response = client_for(mentor).post(URL, {"message": "hello"}, format="json")
    assert response.status_code == 503
    assert response.data["error"]["code"] == "ai_unavailable"


def test_requires_authentication():
    assert APIClient().post(URL, {"message": "hi"}, format="json").status_code in (401, 403)


PROGRAMME_ROLES = {r.value for r in Role} - {Role.PLATFORM_ADMIN}


def test_every_role_has_a_guide():
    # Every role inside a programme; the platform role has no programme for Menta to draw on.
    assert set(knowledge.ROLE_GUIDES) == PROGRAMME_ROLES


def test_menta_is_closed_to_platform_admins(db):
    from apps.identity.models import User

    admin = User.objects.create_superuser("ops-menta@example.test", "Mentor-Platform-2026!", first_name="O", last_name="P")
    with override_settings(**AI_ON):
        response = client_for(admin).post("/api/v1/assistant/chat", {"message": "hello", "page": "/platform"}, format="json")
    assert response.status_code == 403
    assert client_for(admin).get("/api/v1/assistant/navigation").data["data"] == []


def test_status_advertises_assistant(mentor):
    with override_settings(**AI_ON):
        assert client_for(mentor).get("/api/v1/ai/status").data["data"]["assistant"] is True


# ---- navigation, screen awareness and live context -------------------------

from apps.assistant import context, navigation  # noqa: E402


def test_registry_covers_every_role_with_unique_ids_and_relative_hrefs():
    assert set(navigation.REGISTRY) == PROGRAMME_ROLES
    for role, destinations in navigation.REGISTRY.items():
        ids = [d.id for d in destinations]
        assert len(ids) == len(set(ids)), role
        assert "overview" in ids, role
        for d in destinations:
            assert d.href.startswith("/") and not d.href.startswith("//"), d


def test_model_markers_become_validated_actions_and_are_stripped():
    text, actions = service.extract_actions(
        "mentor",
        "Open Log session and pick the students.\n[[go:log]] [[go:log]] [[go:people]] [[go:evil]] [[go:https://x.test]]",
    )
    assert text == "Open Log session and pick the students."
    assert actions == [{"id": "log", "label": "Log session", "href": "/mentor?view=log"}]


def test_actions_are_capped():
    _, actions = service.extract_actions("program_admin", "x [[go:overview]][[go:people]][[go:reports]][[go:activity]]")
    assert [a["id"] for a in actions] == ["overview", "people", "reports"]


@pytest.mark.parametrize(("role", "page", "label"), [
    ("mentor", "/mentor?view=log", "Log session"),
    ("mentor", "/mentor", "Overview"),
    ("student", "/student/placements/3f2b8c1e-1111-4222-8333-944455556666", "a placement's detail page (tabs: Overview, Journey, Sessions, Support)"),
    ("coordinator", "/coordinator/students/invite", "Invite students"),
    ("coordinator", "/coordinator/cohorts/abc", "a cohort's detail page"),
    ("program_admin", "/admin/content/new/module", "Create learning module"),
    ("nurse_manager", "/facility/mentors", "Mentors"),
])
def test_screen_label_knows_where_the_user_is(role, page, label):
    assert navigation.screen_label(role, page) == label


def test_screen_name_keeps_view_and_tab_but_drops_record_ids():
    assert service.screen_name("/mentor?view=log&edit=3f2b8c1e-1111-4222-8333-944455556666") == "/mentor?view=log"
    assert service.screen_name("/admin/account?tab=security") == "/admin/account?tab=security"


def test_navigation_endpoint_returns_only_the_users_role_screens(mentor):
    data = client_for(mentor).get("/api/v1/assistant/navigation").data["data"]
    assert {d["id"] for d in data} == {d.id for d in navigation.for_role("mentor")}
    assert all(not d["href"].startswith("/admin") for d in data)
    assert APIClient().get("/api/v1/assistant/navigation").status_code in (401, 403)


def test_chat_returns_navigation_actions(monkeypatch, mentor):
    monkeypatch.setattr(ai, "urlopen", lambda *_a, **_k: reply("Go to Log session. [[go:log]] [[go:reports]]"))
    with override_settings(**AI_ON):
        response = client_for(mentor).post(URL, {"message": "where do I log a session?", "page": "/mentor"}, format="json")
    assert response.status_code == 200
    assert response.data["data"]["reply"] == "Go to Log session."
    assert response.data["data"]["actions"] == [{"id": "log", "label": "Log session", "href": "/mentor?view=log"}]


def test_marker_only_reply_is_treated_as_provider_failure(monkeypatch, mentor):
    monkeypatch.setattr(ai, "urlopen", lambda *_a, **_k: reply("[[go:log]]"))
    with override_settings(**AI_ON):
        response = client_for(mentor).post(URL, {"message": "hi"}, format="json")
    assert response.status_code == 503


def test_student_situation_gives_next_step_without_personal_details(active_placement, student):
    text = context.situation(student)
    assert "stage Active" in text
    assert "Next step:" in text
    for secret in (student.email, student.full_name):
        assert secret and secret not in text


def test_student_without_placements_is_told_who_creates_them(program, institution):
    from apps.identity.models import User

    lonely = User.objects.create_user(
        email="lonely@example.test", password="pw", first_name="L", last_name="S",
        role=Role.STUDENT, status="active", program=program, institution_id=institution.id,
    )
    assert "coordinator creates and releases" in context.situation(lonely)


def test_staff_situation_is_counts_only(active_placement, nurse_manager, student, mentor):
    text = context.situation(nurse_manager)
    assert "1 placement(s) in your scope: Active 1." in text
    assert "safeguarding" in text.lower()
    for secret in (student.email, mentor.email, student.full_name, mentor.full_name):
        assert secret not in text


def test_system_prompt_carries_status_screens_and_catalogue(mentor, program, captured):
    make_module(program, "Safe handover", "Use SBAR.")
    with override_settings(**AI_ON):
        client_for(mentor).post(URL, {"message": "what training do we have?", "page": "/mentor?view=training"}, format="json")
    system = captured["body"]["messages"][0]["content"]
    assert "They are on: Training (/mentor?view=training)" in system
    assert "## Their status now" in system
    assert "- log: Log session" in system
    assert "Training modules you can open:" in system and "- Safe handover" in system
    assert mentor.email not in system


def test_content_managers_see_the_whole_programme_catalogue(program, mentor, captured):
    """Regression: an admin asking "what training do we have?" was told nothing was published."""
    from apps.identity.models import User

    admin = User.objects.create_user(
        email="catalogue-admin@example.test", password="pw", first_name="Cat", last_name="Admin",
        role=Role.PROGRAM_ADMIN, status="active", program=program,
    )
    make_module(program, "Safe handover", "Use SBAR.")
    make_module(program, "Draft induction", "Not yet ready.", published=False)
    other = Program.objects.create(name="Other")
    make_module(other, "Foreign module", "Elsewhere.")
    text = knowledge.catalogue_text(admin)
    assert "Training modules in the programme (1 published, 1 draft):" in text
    assert "- Safe handover (published; for mentors; 1 lesson(s))" in text
    assert "- Draft induction (draft; for mentors" in text
    assert "Foreign module" not in text
    # Mentors still only see what they can open.
    mentor_text = knowledge.catalogue_text(mentor)
    assert "Safe handover" in mentor_text and "Draft induction" not in mentor_text


def test_a_single_incidental_word_is_not_a_source(mentor, program):
    make_module(program, "Documentation basics", "Keep notes free of patient identifiers.")
    assert knowledge.retrieve(mentor, "my patient is bleeding, what dose should I give?") == []
