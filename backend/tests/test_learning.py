import json
import uuid

from django.http import QueryDict
from rest_framework.test import APIClient

from apps.identity.models import Role
from apps.learning.models import Lesson, ModuleCompletion, Quiz, QuizQuestion, TrainingModule
from apps.learning import api as learning
from apps.learning.serializers import TrainingModuleWriteSerializer


def test_module_write_serializer_parses_structured_multipart_fields():
    payload = QueryDict("", mutable=True)
    for key, value in {
        "title": "Clinical handover",
        "description": "A short handover guide.",
        "pass_mark": "70",
        "is_required": "false",
        "visible_roles": json.dumps([Role.MENTOR]),
        "category": "clinical_care",
        "lessons": json.dumps(
            [
                {
                    "title": "SBAR",
                    "body": "Use a structured handover.",
                    "lesson_type": "reading",
                    "duration_minutes": 5,
                }
            ]
        ),
        "quiz": "[]",
    }.items():
        payload[key] = value

    serializer = TrainingModuleWriteSerializer(data=payload)

    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["visible_roles"] == [Role.MENTOR]
    assert serializer.validated_data["lessons"][0]["title"] == "SBAR"
    assert serializer.validated_data["quiz"] == []


def test_programme_admin_can_create_module_from_multipart_form(program):
    admin = program.users.create_user(
        email="module-admin@example.test",
        password="pw",
        first_name="Module",
        last_name="Admin",
        role=Role.PROGRAM_ADMIN,
        status="active",
        program=program,
    )
    client = APIClient()
    client.force_authenticate(admin)

    response = client.post(
        "/api/v1/training/modules/admin",
        {
            "title": "Clinical handover",
            "description": "A short handover guide.",
            "pass_mark": "70",
            "is_required": "false",
            "visible_roles": json.dumps([Role.MENTOR]),
            "category": "clinical_care",
            "lessons": json.dumps(
                [
                    {
                        "title": "SBAR",
                        "body": "Use a structured handover.",
                        "lesson_type": "reading",
                        "duration_minutes": 5,
                    }
                ]
            ),
            "quiz": "[]",
        },
        format="multipart",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )

    assert response.status_code == 201, response.data
    assert response.data["data"]["title"] == "Clinical handover"
    assert response.data["data"]["lessons"][0]["title"] == "SBAR"
    assert response.data["data"]["quiz"] == []


def make_module(program, *, required=True):
    module = TrainingModule.objects.create(
        program=program, title="Safe handover", slug="safe-handover", pass_mark=50,
        is_required=required, is_published=True, visible_roles=[Role.MENTOR],
    )
    Lesson.objects.create(module=module, position=1, title="Handover basics", body="Use a structured handover.")
    quiz = Quiz.objects.create(module=module)
    question = QuizQuestion.objects.create(quiz=quiz, position=1, prompt="Which format is structured?", options=["SBAR", "None"], correct_option="SBAR")
    return module, question


def test_learning_attempt_records_failure_then_completion(program, mentor):
    module, question = make_module(program)
    client = APIClient()
    client.force_authenticate(mentor)

    failed = client.post(f"/api/v1/training/modules/{module.id}/attempts", {"answers": {str(question.id): "None"}}, format="json")
    assert failed.status_code == 200
    assert failed.data["data"]["passed"] is False
    assert not ModuleCompletion.objects.filter(module=module, user=mentor).exists()

    passed = client.post(f"/api/v1/training/modules/{module.id}/attempts", {"answers": {str(question.id): "SBAR"}}, format="json")
    assert passed.status_code == 200
    assert passed.data["data"]["passed"] is True
    assert ModuleCompletion.objects.filter(module=module, user=mentor, score=100).exists()
    assert learning.required_modules_complete(mentor)


def test_training_list_hides_correct_answers_and_reports_progress(program, mentor):
    module, question = make_module(program)
    client = APIClient()
    client.force_authenticate(mentor)
    response = client.get("/api/v1/training/modules")
    assert response.status_code == 200
    assert response.data["data"][0]["quiz"][0]["options"] == ["SBAR", "None"]
    assert "correct_option" not in response.data["data"][0]["quiz"][0]
    assert client.get("/api/v1/me/training").data["data"]["required_complete"] is False


def _module_admin(program, email="lifecycle-module-admin@example.test"):
    return program.users.create_user(email=email, password="pw", first_name="Mod", last_name="Admin", role=Role.PROGRAM_ADMIN, status="active", program=program)


def _headers():
    return {"HTTP_IDEMPOTENCY_KEY": str(uuid.uuid4())}


def test_module_unpublish_archive_restore_and_delete_rules(program, mentor):
    admin = _module_admin(program)
    module, question = make_module(program)
    client = APIClient()
    client.force_authenticate(admin)
    mentor_client = APIClient()
    mentor_client.force_authenticate(mentor)

    assert client.delete(f"/api/v1/training/modules/{module.id}", **_headers()).status_code == 409  # still live
    assert client.post(f"/api/v1/training/modules/{module.id}/unpublish", **_headers()).data["data"]["status"] == "draft"
    assert mentor_client.get("/api/v1/training/modules").data["data"] == []
    client.post(f"/api/v1/training/modules/{module.id}/publish", **_headers())
    mentor_client.post(f"/api/v1/training/modules/{module.id}/attempts", {"answers": {str(question.id): "SBAR"}}, format="json")

    archived = client.post(f"/api/v1/training/modules/{module.id}/archive", {}, format="json", **_headers())
    assert archived.data["data"]["status"] == "archived"
    assert mentor_client.get("/api/v1/training/modules").data["data"] == []
    # Learners have records, so archive is allowed but delete is not.
    assert client.delete(f"/api/v1/training/modules/{module.id}", **_headers()).status_code == 409
    restored = client.post(f"/api/v1/training/modules/{module.id}/archive", {"restore": True}, format="json", **_headers())
    assert restored.data["data"]["status"] == "draft"
    assert ModuleCompletion.objects.filter(module=module, user=mentor).exists()


def test_unused_draft_module_can_be_duplicated_and_deleted(program):
    admin = _module_admin(program, "dup-module-admin@example.test")
    module, _ = make_module(program)
    client = APIClient()
    client.force_authenticate(admin)
    copy = client.post(f"/api/v1/training/modules/{module.id}/duplicate", **_headers())
    assert copy.status_code == 201
    data = copy.data["data"]
    assert data["status"] == "draft" and data["title"].endswith("(copy)") and len(data["lessons"]) == 1 and len(data["quiz"]) == 1
    assert client.delete(f"/api/v1/training/modules/{data['id']}", **_headers()).status_code == 204
    assert TrainingModule.objects.filter(id=module.id).exists()


def test_quiz_free_module_is_completed_by_reading_and_titles_can_repeat(program, mentor):
    admin = _module_admin(program, "read-module-admin@example.test")
    module = TrainingModule.objects.create(program=program, title="Read only", slug="read-only", is_required=True, is_published=True, visible_roles=[Role.MENTOR])
    Lesson.objects.create(module=module, position=1, title="Read", body="Body")
    client = APIClient()
    client.force_authenticate(mentor)
    assert not learning.required_modules_complete(mentor)
    response = client.post(f"/api/v1/training/modules/{module.id}/complete", **_headers())
    assert response.status_code == 200 and response.data["data"]["passed"] is True
    assert learning.required_modules_complete(mentor)
    assert client.post(f"/api/v1/training/modules/{module.id}/complete", **_headers()).status_code == 200
    assert ModuleCompletion.objects.filter(module=module, user=mentor).count() == 1

    admin_client = APIClient()
    admin_client.force_authenticate(admin)
    payload = {"title": "Read only", "description": "d", "lessons": json.dumps([{"title": "L", "body": "B"}])}
    created = admin_client.post("/api/v1/training/modules/admin", payload, format="multipart", **_headers())
    assert created.status_code == 201, created.data
    assert created.data["data"]["slug"] == "read-only-2"
