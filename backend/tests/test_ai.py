"""AI provider boundary and lesson explanation endpoint.

The network is always mocked: no test may reach a real provider or spend money.
"""

import io
import json
from urllib.error import HTTPError

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.core import ai
from apps.identity.models import Program, Role
from apps.learning.models import Lesson, TrainingModule

AI_ON = {"AI_ENABLED": True, "AI_API_KEY": "sk-test-secret", "AI_MODEL": "gpt-4o-mini", "AI_TEMPERATURE": 0.2}


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def provider_reply(text="A plain explanation."):
    return FakeResponse(json.dumps({"choices": [{"message": {"content": text}}]}).encode())


@pytest.fixture
def lesson(program):
    module = TrainingModule.objects.create(
        program=program, title="Safe handover", slug="safe-handover", pass_mark=50,
        is_required=False, is_published=True, visible_roles=[Role.MENTOR],
    )
    return Lesson.objects.create(module=module, position=1, title="SBAR", body="Use a structured handover.")


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def test_chat_completion_sends_openai_request_and_returns_text(monkeypatch):
    seen = {}

    def fake_urlopen(request, timeout):
        seen["url"] = request.full_url
        seen["auth"] = request.get_header("Authorization")
        seen["body"] = json.loads(request.data)
        seen["timeout"] = timeout
        return provider_reply("  Hello  ")

    monkeypatch.setattr(ai, "urlopen", fake_urlopen)
    with override_settings(**AI_ON, AI_API_BASE_URL="https://api.openai.com/v1"):
        assert ai.chat_completion(feature="t", system="sys", user="usr") == "Hello"

    assert seen["url"] == "https://api.openai.com/v1/chat/completions"
    assert seen["auth"] == "Bearer sk-test-secret"
    assert seen["body"]["model"] == "gpt-4o-mini"
    assert seen["body"]["max_completion_tokens"] == 500
    assert "max_tokens" not in seen["body"]
    assert seen["body"]["temperature"] == 0.2
    assert [m["role"] for m in seen["body"]["messages"]] == ["system", "user"]


def test_temperature_is_omitted_when_unset_for_reasoning_models(monkeypatch):
    seen = {}
    monkeypatch.setattr(ai, "urlopen", lambda request, timeout: seen.update(body=json.loads(request.data)) or provider_reply())
    with override_settings(**{**AI_ON, "AI_TEMPERATURE": None}):
        ai.chat_completion(feature="t", system="s", user="u")
    assert "temperature" not in seen["body"]


def test_disabled_or_keyless_provider_never_makes_a_request(monkeypatch):
    def boom(*_a, **_k):
        raise AssertionError("network must not be reached")

    monkeypatch.setattr(ai, "urlopen", boom)
    for overrides in ({"AI_ENABLED": False, "AI_API_KEY": "k"}, {"AI_ENABLED": True, "AI_API_KEY": ""}):
        with override_settings(**overrides), pytest.raises(ai.AIProviderError):
            ai.chat_completion(feature="t", system="s", user="u")


@pytest.mark.parametrize("failure", [
    HTTPError("https://x", 429, "rate limited", {}, io.BytesIO(b"quota")),
    TimeoutError(),
    OSError("down"),
])
def test_transport_failures_become_provider_error_without_leaking_content(monkeypatch, caplog, failure):
    def fail(*_a, **_k):
        raise failure

    monkeypatch.setattr(ai, "urlopen", fail)
    with override_settings(**AI_ON), caplog.at_level("INFO"), pytest.raises(ai.AIProviderError):
        ai.chat_completion(feature="t", system="s", user="SECRET-LESSON-TEXT")
    assert "SECRET-LESSON-TEXT" not in caplog.text
    assert "sk-test-secret" not in caplog.text


@pytest.mark.parametrize("raw", [b"not json", b'{"choices": []}', b'{"choices":[{"message":{"content":""}}]}'])
def test_malformed_provider_replies_are_rejected(monkeypatch, raw):
    monkeypatch.setattr(ai, "urlopen", lambda *_a, **_k: FakeResponse(raw))
    with override_settings(**AI_ON), pytest.raises(ai.AIProviderError):
        ai.chat_completion(feature="t", system="s", user="u")


def test_ai_status_reflects_configuration(mentor):
    client = client_for(mentor)
    with override_settings(AI_ENABLED=False, AI_API_KEY=""):
        assert client.get("/api/v1/ai/status").data["data"]["lesson_explanations"] is False
    with override_settings(**AI_ON):
        assert client.get("/api/v1/ai/status").data["data"]["lesson_explanations"] is True
    assert APIClient().get("/api/v1/ai/status").status_code in (401, 403)


def test_explain_lesson_returns_grounded_explanation(monkeypatch, mentor, lesson):
    seen = {}
    monkeypatch.setattr(ai, "urlopen", lambda request, timeout: seen.update(body=json.loads(request.data)) or provider_reply("Use SBAR."))
    with override_settings(**AI_ON):
        response = client_for(mentor).post(
            f"/api/v1/training/modules/{lesson.module_id}/explain-lesson", {"lesson_id": str(lesson.id)}, format="json"
        )
    assert response.status_code == 200, response.data
    assert response.data["data"] == {"lesson_id": str(lesson.id), "lesson_title": "SBAR", "explanation": "Use SBAR."}
    user_message = seen["body"]["messages"][1]["content"]
    assert "Use a structured handover." in user_message
    assert mentor.email not in json.dumps(seen["body"])


def test_explain_lesson_is_unavailable_when_ai_is_off(monkeypatch, mentor, lesson):
    monkeypatch.setattr(ai, "urlopen", lambda *_a, **_k: pytest.fail("network must not be reached"))
    response = client_for(mentor).post(
        f"/api/v1/training/modules/{lesson.module_id}/explain-lesson", {"lesson_id": str(lesson.id)}, format="json"
    )
    assert response.status_code == 503
    assert response.data["error"]["code"] == "ai_unavailable"


def test_explain_lesson_hides_other_programmes_unpublished_and_role_hidden_modules(monkeypatch, mentor, lesson):
    monkeypatch.setattr(ai, "urlopen", lambda *_a, **_k: pytest.fail("network must not be reached"))
    other = Program.objects.create(name="Other programme")
    foreign = TrainingModule.objects.create(
        program=other, title="Foreign", slug="foreign", pass_mark=50, is_required=False, is_published=True, visible_roles=[Role.MENTOR],
    )
    foreign_lesson = Lesson.objects.create(module=foreign, position=1, title="F", body="foreign body")
    draft = TrainingModule.objects.create(
        program=mentor.program, title="Draft", slug="draft", pass_mark=50, is_required=False, is_published=False, visible_roles=[Role.MENTOR],
    )
    draft_lesson = Lesson.objects.create(module=draft, position=1, title="D", body="draft body")
    student_only = TrainingModule.objects.create(
        program=mentor.program, title="Students", slug="students", pass_mark=50, is_required=False, is_published=True, visible_roles=[Role.STUDENT],
    )
    student_lesson = Lesson.objects.create(module=student_only, position=1, title="S", body="student body")

    client = client_for(mentor)
    with override_settings(**AI_ON):
        for module, target in ((foreign, foreign_lesson), (draft, draft_lesson), (student_only, student_lesson)):
            response = client.post(f"/api/v1/training/modules/{module.id}/explain-lesson", {"lesson_id": str(target.id)}, format="json")
            assert response.status_code == 404
        # A lesson from a visible module cannot be reached through a different module id.
        crossed = client.post(f"/api/v1/training/modules/{lesson.module_id}/explain-lesson", {"lesson_id": str(foreign_lesson.id)}, format="json")
        assert crossed.status_code == 404


def test_explain_lesson_maps_provider_failure_to_stable_503(monkeypatch, mentor, lesson):
    def fail(*_a, **_k):
        raise TimeoutError

    monkeypatch.setattr(ai, "urlopen", fail)
    with override_settings(**AI_ON):
        response = client_for(mentor).post(
            f"/api/v1/training/modules/{lesson.module_id}/explain-lesson", {"lesson_id": str(lesson.id)}, format="json"
        )
    assert response.status_code == 503
    assert response.data["error"]["code"] == "ai_unavailable"


def test_explain_lesson_requires_authentication(lesson):
    response = APIClient().post(
        f"/api/v1/training/modules/{lesson.module_id}/explain-lesson", {"lesson_id": str(lesson.id)}, format="json"
    )
    assert response.status_code in (401, 403)
