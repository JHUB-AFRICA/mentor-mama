from rest_framework.test import APIClient

from apps.identity.models import Role
from apps.learning.models import Lesson, ModuleCompletion, Quiz, QuizQuestion, TrainingModule
from apps.learning import api as learning


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
