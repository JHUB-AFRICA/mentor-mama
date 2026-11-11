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
    early = client.post(f"/api/v1/training/modules/{module.id}/complete", **_headers())
    assert early.status_code == 409 or early.status_code == 400
    lesson = module.lessons.get()
    assert client.post(f"/api/v1/training/modules/{module.id}/lessons/{lesson.id}/visit", {}, format="json").status_code == 200
    assert client.get("/api/v1/training/modules").data["data"][0]["visited_lesson_ids"] == [str(lesson.id)]
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


def test_required_gate_ignores_other_audiences_and_archived_modules(program, mentor):
    from django.utils import timezone

    student_only = TrainingModule.objects.create(program=program, title="For students", slug="for-students", is_required=True, is_published=True, visible_roles=[Role.STUDENT])
    archived = TrainingModule.objects.create(program=program, title="Old", slug="old", is_required=True, is_published=True, visible_roles=[Role.MENTOR], archived_at=timezone.now())
    assert learning.required_modules_complete(mentor)
    data = learning.progress(mentor)
    assert data["total"] == 0 and data["required_total"] == 0
    assert student_only and archived


def test_scoring_uses_option_ids_and_survives_wording_edits(program, mentor):
    module, question = make_module(program)
    question.refresh_from_db()
    sbar_id = question.option_ids[0]
    client = APIClient()
    client.force_authenticate(mentor)
    listed = client.get("/api/v1/training/modules").data["data"][0]["quiz"][0]
    assert [c["id"] for c in listed["choices"]] == question.option_ids and "correct_option_id" not in listed
    admin = _module_admin(program, "ids-admin@example.test")
    admin_client = APIClient()
    admin_client.force_authenticate(admin)
    body = {"title": "Safe handover", "pass_mark": 50, "keep_published": "true", "visible_roles": [Role.MENTOR], "is_required": True,
            "lessons": [{"title": "Handover basics", "body": "Use a structured handover."}],
            "quiz": [{"prompt": "Which format is structured?", "options": [{"id": sbar_id, "text": "SBAR format"}, "None"], "correct_option": sbar_id}]}
    assert admin_client.post(f"/api/v1/training/modules/{module.id}/revise", body, format="json", **_headers()).status_code == 200
    question.refresh_from_db()
    assert question.options[0] == "SBAR format" and question.option_ids[0] == sbar_id and question.correct_option_id == sbar_id
    result = client.post(f"/api/v1/training/modules/{module.id}/attempts", {"answers": {str(question.id): sbar_id}}, format="json")
    assert result.data["data"]["passed"] is True


def test_plain_text_projection_handles_editor_json_and_legacy_text():
    from apps.learning.text import plain_text

    doc = json.dumps({"type": "doc", "content": [
        {"type": "heading", "content": [{"type": "text", "text": "SBAR"}]},
        {"type": "paragraph", "content": [{"type": "text", "text": "Situation"}, {"type": "text", "text": " first"}]}]})
    assert plain_text(doc) == "SBAR\n\nSituation first"
    assert plain_text("Just text") == "Just text"


def test_library_rows_show_the_viewers_completion(program, mentor):
    module, question = make_module(program)
    client = APIClient()
    client.force_authenticate(mentor)
    def row():
        return next(r for r in client.get("/api/v1/library").data["data"] if r["kind"] == "module")
    assert row()["completed"] is False
    client.post(f"/api/v1/training/modules/{module.id}/attempts", {"answers": {str(question.id): "SBAR"}}, format="json")
    assert row()["completed"] is True


def test_students_can_complete_modules_meant_for_them_but_mentors_cannot_see_them(program, mentor, student):
    module = TrainingModule.objects.create(program=program, title="Student intro", slug="student-intro", is_published=True, visible_roles=[Role.STUDENT])
    lesson = Lesson.objects.create(module=module, position=1, title="Welcome", body="Hello")
    mentor_client, student_client = APIClient(), APIClient()
    mentor_client.force_authenticate(mentor)
    student_client.force_authenticate(student)
    assert mentor_client.post(f"/api/v1/training/modules/{module.id}/lessons/{lesson.id}/visit", {}, format="json").status_code in {400, 409}
    assert student_client.post(f"/api/v1/training/modules/{module.id}/lessons/{lesson.id}/visit", {}, format="json").status_code == 200
    assert student_client.post(f"/api/v1/training/modules/{module.id}/complete", **_headers()).status_code == 200
    assert ModuleCompletion.objects.filter(module=module, user=student).exists()


def test_video_lessons_need_a_supported_link_and_expose_embed_details(program):
    admin = _module_admin(program, "video-admin@example.test")
    client = APIClient()
    client.force_authenticate(admin)
    base = {"title": "Video module", "lessons": [{"title": "Watch", "body": "Summary", "lesson_type": "video", "video_url": "https://evil.example/x"}]}
    assert client.post("/api/v1/training/modules/admin", base, format="json", **_headers()).status_code == 400
    base["lessons"][0]["video_url"] = "https://youtu.be/dQw4w9WgXcQ"
    created = client.post("/api/v1/training/modules/admin", base, format="json", **_headers())
    assert created.status_code == 201
    video = created.data["data"]["lessons"][0]["video"]
    assert video["provider"] == "youtube" and video["embed_url"].startswith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")


def _revise(client, module, title, lessons, quiz=None, **extra):
    body = {"title": title, "pass_mark": 50, "keep_published": "true", "visible_roles": [Role.MENTOR], "is_required": True,
            "lessons": lessons, "quiz": quiz or [], **extra}
    return client.post(f"/api/v1/training/modules/{module.id}/revise", body, format="json", **_headers())


def test_publishing_creates_versions_and_learners_finish_the_version_they_started(program, mentor):
    admin = _module_admin(program, "versions-admin@example.test")
    admin_client, learner = APIClient(), APIClient()
    admin_client.force_authenticate(admin)
    learner.force_authenticate(mentor)
    created = admin_client.post("/api/v1/training/modules/admin", {
        "title": "Versioned", "is_required": True, "lessons": [{"title": "One", "body": "First wording"}]}, format="json", **_headers())
    module = TrainingModule.objects.get(id=created.data["data"]["id"])
    lesson_id = str(module.lessons.get().id)
    published = admin_client.post(f"/api/v1/training/modules/{module.id}/publish", {}, format="json", **_headers())
    assert published.status_code == 200 and published.data["data"]["version"] == 1
    assert admin_client.post(f"/api/v1/training/modules/{module.id}/publish", {}, format="json", **_headers()).status_code == 200
    assert module.versions.count() == 1  # republishing unchanged content makes no new version

    # The mentor starts version 1.
    assert learner.post(f"/api/v1/training/modules/{module.id}/lessons/{lesson_id}/visit", {}, format="json").status_code == 200
    # An edit to the live module stays invisible to learners until published, and keeps the lesson id.
    assert _revise(admin_client, module, "Versioned", [{"id": lesson_id, "title": "One", "body": "Second wording"}]).status_code == 200
    assert str(module.lessons.get().id) == lesson_id
    shown = learner.get("/api/v1/training/modules").data["data"][0]
    assert shown["lessons"][0]["body"] == "First wording" and shown["version"] == 1
    assert admin_client.get("/api/v1/training/modules/admin").data["data"][0]["has_unpublished_changes"] is True

    # Major changes need a reason; then the new version is published.
    assert admin_client.post(f"/api/v1/training/modules/{module.id}/publish", {"change_kind": "major"}, format="json", **_headers()).status_code in {400, 409}
    ok = admin_client.post(f"/api/v1/training/modules/{module.id}/publish", {"change_kind": "major", "change_note": "New protocol"}, format="json", **_headers())
    assert ok.status_code == 200 and ok.data["data"]["version"] == 2

    # The mentor is still on version 1 and completes it; the completion records version 1.
    assert learner.get("/api/v1/training/modules").data["data"][0]["lessons"][0]["body"] == "First wording"
    assert learner.post(f"/api/v1/training/modules/{module.id}/complete", **_headers()).status_code == 200
    completion = ModuleCompletion.objects.get(module=module, user=mentor)
    assert completion.version == 1
    # Within the grace period the older completion still satisfies the placement gate...
    assert learning.required_modules_complete(mentor)
    # ...and after it, a refresh is needed.
    from datetime import timedelta

    from django.utils import timezone

    module.versions.filter(number=2).update(published_at=timezone.now() - timedelta(days=31))
    assert not learning.required_modules_complete(mentor)
    assert learner.get("/api/v1/training/modules").data["data"][0]["needs_refresh"] is True

    # History and restore-as-draft.
    history = admin_client.get(f"/api/v1/training/modules/{module.id}/versions").data["data"]
    assert [row["number"] for row in history] == [2, 1] and history[1]["learners_completed"] == 1
    assert admin_client.post(f"/api/v1/training/modules/{module.id}/versions/1/restore", {}, format="json", **_headers()).status_code == 200
    assert module.lessons.get().body == "First wording"


def test_learners_move_off_an_old_version_once_a_major_change_is_past_its_grace_period(program, mentor):
    from datetime import timedelta

    from django.utils import timezone

    from apps.learning import versioning

    module, _ = make_module(program)
    v1 = versioning.publish(module=module, user=None)
    lesson = module.lessons.get()
    LessonProgressModel = __import__("apps.learning.models", fromlist=["LessonProgress"]).LessonProgress
    LessonProgressModel.objects.create(user=mentor, module=module, lesson_key=lesson.id, version=1)
    lesson.body = "New wording"
    lesson.save()
    v2 = versioning.publish(module=module, user=None, change_kind="major", change_note="Changed")
    assert versioning.pinned_version(module, mentor).number == v1.number
    module.versions.filter(number=v2.number).update(published_at=timezone.now() - timedelta(days=31))
    assert versioning.pinned_version(module, mentor).number == 2


def test_question_types_feedback_and_all_or_nothing_scoring(program, mentor):
    admin = _module_admin(program, "types-admin@example.test")
    admin_client, learner = APIClient(), APIClient()
    admin_client.force_authenticate(admin)
    learner.force_authenticate(mentor)
    quiz = [
        {"kind": "single", "scenario": "A student reports chest pain.", "prompt": "First action?", "explanation": "Escalate first.",
         "options": [{"text": "Escalate", "feedback": ""}, {"text": "Wait", "feedback": "Waiting delays care."}], "correct_options": ["Escalate"]},
        {"kind": "multi", "prompt": "Safe practices?", "options": [{"text": "Wash hands"}, {"text": "Skip gloves"}, {"text": "Label samples"}],
         "correct_options": ["Wash hands", "Label samples"]},
        {"kind": "true_false", "prompt": "Handover is structured.", "options": [{"text": "True"}, {"text": "False"}], "correct_options": ["True"]},
    ]
    created = admin_client.post("/api/v1/training/modules/admin", {"title": "Types", "pass_mark": 100, "visible_roles": [Role.MENTOR],
                                "lessons": [{"title": "L", "body": "b"}], "quiz": quiz}, format="json", **_headers())
    assert created.status_code == 201, created.data
    module_id = created.data["data"]["id"]
    assert admin_client.post(f"/api/v1/training/modules/{module_id}/publish", {}, format="json", **_headers()).status_code == 200
    shown = {q["kind"]: q for q in learner.get("/api/v1/training/modules").data["data"][0]["quiz"]}
    assert set(shown) == {"single", "multi", "true_false"} and shown["single"]["scenario"].startswith("A student")
    assert "explanation" not in shown["single"] and "feedback" not in shown["single"]["choices"][1] and "correct_option_ids" not in shown["multi"]

    def ids(q, *texts):
        by_text = {c["text"]: c["id"] for c in q["choices"]}
        return [by_text[t] for t in texts]

    def attempt(single, multi, tf):
        return learner.post(f"/api/v1/training/modules/{module_id}/attempts", {"answers": {
            shown["single"]["id"]: ids(shown["single"], single)[0], shown["multi"]["id"]: ids(shown["multi"], *multi),
            shown["true_false"]["id"]: ids(shown["true_false"], tf)[0]}}, format="json").data["data"]

    partial = attempt("Wait", ["Wash hands"], "True")  # wrong single, incomplete multi (no partial credit)
    assert partial["passed"] is False and partial["score"] == 33
    rows = {r["question_id"]: r for r in partial["results"]}
    assert rows[shown["single"]["id"]]["feedback"] == ["Waiting delays care."] and rows[shown["single"]["id"]]["explanation"] == "Escalate first."
    assert rows[shown["multi"]["id"]]["correct"] is False and "correct_option_ids" not in rows[shown["multi"]["id"]]
    full = attempt("Escalate", ["Wash hands", "Label samples"], "True")
    assert full["passed"] is True and full["score"] == 100 and all(r["correct_option_ids"] for r in full["results"])
    # Admins see the keys, feedback and explanation.
    admin_view = next(m for m in admin_client.get("/api/v1/training/modules/admin").data["data"] if m["id"] == module_id)
    multi = next(q for q in admin_view["quiz"] if q["kind"] == "multi")
    assert len(multi["correct_option_ids"]) == 2
    # Unchanged content is not reported as an unpublished change.
    assert admin_view["has_unpublished_changes"] is False


def test_question_validation_rejects_bad_shapes(program):
    admin = _module_admin(program, "badq-admin@example.test")
    client = APIClient()
    client.force_authenticate(admin)

    def post(question):
        return client.post("/api/v1/training/modules/admin", {"title": "Q", "lessons": [{"title": "L", "body": "b"}], "quiz": [question]}, format="json", **_headers()).status_code

    assert post({"kind": "single", "prompt": "p", "options": [{"text": "a"}, {"text": "b"}], "correct_options": ["a", "b"]}) == 400
    assert post({"kind": "multi", "prompt": "p", "options": [{"text": "a"}, {"text": "a"}], "correct_options": ["a"]}) == 400
    assert post({"kind": "true_false", "prompt": "p", "options": [{"text": "a"}, {"text": "b"}, {"text": "c"}], "correct_options": ["a"]}) == 400
    assert post({"kind": "weird", "prompt": "p", "options": [{"text": "a"}, {"text": "b"}], "correct_options": ["a"]}) == 400
    assert post({"kind": "single", "prompt": "p", "options": [{"text": "a"}, {"text": "b"}], "correct_options": ["zzz"]}) == 400


def test_certificate_is_issued_on_completion_downloadable_and_verifiable(program, mentor):
    module, question = make_module(program)
    admin = _module_admin(program, "cert-admin@example.test")
    client, admin_client = APIClient(), APIClient()
    client.force_authenticate(mentor)
    admin_client.force_authenticate(admin)
    assert client.get(f"/api/v1/training/modules/{module.id}/certificate").status_code == 404  # not completed yet
    client.post(f"/api/v1/training/modules/{module.id}/attempts", {"answers": {str(question.id): "SBAR"}}, format="json")
    response = client.get(f"/api/v1/training/modules/{module.id}/certificate")
    assert response.status_code == 200 and response["Content-Type"] == "application/pdf" and response.content.startswith(b"%PDF")
    assert "no-store" in response["Cache-Control"]
    from apps.learning.models import Certificate

    certificate = Certificate.objects.get(user=mentor, module=module)
    assert certificate.number.startswith("MM-") and certificate.module_title == "Safe handover"
    # Asking again never issues a second certificate.
    client.get(f"/api/v1/training/modules/{module.id}/certificate")
    assert Certificate.objects.filter(user=mentor, module=module).count() == 1
    verified = admin_client.get(f"/api/v1/training/certificates/{certificate.number}").data["data"]
    assert verified["valid"] is True and verified["module_title"] == "Safe handover"
    assert admin_client.get("/api/v1/training/certificates/MM-2000-000001").data["data"]["valid"] is False
    assert client.get(f"/api/v1/training/certificates/{certificate.number}").status_code in {403, 404}


def test_modules_can_switch_certificates_off(program, mentor):
    module, question = make_module(program)
    module.certificate_enabled = False
    module.save()
    client = APIClient()
    client.force_authenticate(mentor)
    client.post(f"/api/v1/training/modules/{module.id}/attempts", {"answers": {str(question.id): "SBAR"}}, format="json")
    assert client.get(f"/api/v1/training/modules/{module.id}/certificate").status_code == 404


def test_training_report_is_scoped_and_lists_completions_and_hard_questions(program, mentor, coordinator):
    module, question = make_module(program)
    admin = _module_admin(program, "report-admin@example.test")
    learner, boss, staff = APIClient(), APIClient(), APIClient()
    learner.force_authenticate(mentor)
    boss.force_authenticate(admin)
    staff.force_authenticate(coordinator)
    assert learner.get("/api/v1/reports/training").status_code in {403, 404}
    before = boss.get("/api/v1/reports/training").data["data"]
    assert before["summary"]["mentors"] >= 1 and before["summary"]["mentors_complete"] == 0
    assert next(r for r in before["mentors"] if r["email"] == mentor.email)["state"] == "not_started"
    for _ in range(3):  # three wrong attempts make the question rankable
        learner.post(f"/api/v1/training/modules/{module.id}/attempts", {"answers": {str(question.id): "None"}}, format="json")
    mid = boss.get("/api/v1/reports/training").data["data"]
    assert next(r for r in mid["mentors"] if r["email"] == mentor.email)["state"] == "in_progress"
    assert mid["hard_questions"][0]["wrong_rate"] == 100 and mid["hard_questions"][0]["attempts"] == 3
    learner.post(f"/api/v1/training/modules/{module.id}/attempts", {"answers": {str(question.id): "SBAR"}}, format="json")
    after = boss.get("/api/v1/reports/training").data["data"]
    assert after["summary"]["mentors_complete"] == 1 and after["summary"]["rate"] == 100.0
    row = next(r for r in after["mentors"] if r["email"] == mentor.email)
    assert row["state"] == "complete" and row["required_completed"] == 1 and after["modules"][0]["completed"] == 1
    # A coordinator with no placements in scope sees none of this institution's unrelated mentors.
    scoped = staff.get("/api/v1/reports/training")
    assert scoped.status_code == 200 and scoped.data["data"]["summary"]["mentors"] == 0


def test_training_report_exports_in_every_format(program, mentor):
    from apps.analytics import export_service
    module, question = make_module(program)
    client = APIClient()
    client.force_authenticate(mentor)
    client.post(f"/api/v1/training/modules/{module.id}/attempts", {"answers": {str(question.id): "SBAR"}}, format="json")
    admin = _module_admin(program, "export-admin@example.test")
    for fmt, marker in (("csv", b"Mentor"), ("xlsx", b"PK"), ("json", b"Mentor training report"), ("pdf", b"%PDF")):
        record = export_service.create_export(actor=admin, export_type="training", filters={}, format=fmt)
        done = export_service.generate_export(record.id)
        assert done.status == "completed" and done.row_count >= 1, (fmt, done.error_code)
        content = export_service.get_export_storage().open(done.storage_key).read()
        assert marker in content[:4000] or content.startswith(marker), fmt


def test_lesson_checks_are_formative_and_the_question_bank_copies_questions(program, mentor):
    import uuid as uuidlib

    admin = _module_admin(program, "checks-admin@example.test")
    admin_client, learner = APIClient(), APIClient()
    admin_client.force_authenticate(admin)
    learner.force_authenticate(mentor)
    lesson_id = str(uuidlib.uuid4())
    inline = {"kind": "single", "prompt": "Quick check?", "lesson_id": lesson_id, "explanation": "Because.",
              "options": [{"text": "Yes", "feedback": ""}, {"text": "No", "feedback": "Not quite."}], "correct_options": ["Yes"]}
    body = {"title": "Checks", "visible_roles": [Role.MENTOR], "pass_mark": 100,
            "lessons": [{"id": lesson_id, "title": "L", "body": "b"}], "quiz": [inline]}
    created = admin_client.post("/api/v1/training/modules/admin", body, format="json", **_headers())
    assert created.status_code == 201, created.data
    data = created.data["data"]
    module_id = data["id"]
    assert str(data["lessons"][0]["id"]) == lesson_id  # a client-chosen id is kept
    assert data["quiz"] == [] and len(data["checks"]) == 1 and data["checks"][0]["lesson_id"] == lesson_id
    # A check pointing at a lesson that is not in the module is rejected.
    bad = {**body, "quiz": [{**inline, "lesson_id": str(uuidlib.uuid4())}]}
    assert admin_client.post("/api/v1/training/modules/admin", bad, format="json", **_headers()).status_code == 400

    assert admin_client.post(f"/api/v1/training/modules/{module_id}/publish", {}, format="json", **_headers()).status_code == 200
    shown = learner.get("/api/v1/training/modules").data["data"][0]
    assert shown["quiz"] == [] and shown["has_quiz"] is False and len(shown["checks"]) == 1
    check = shown["checks"][0]
    wrong = learner.post(f"/api/v1/training/modules/{module_id}/lessons/{lesson_id}/check", {"answers": {check["id"]: check["choices"][1]["id"]}}, format="json")
    assert wrong.status_code == 200 and wrong.data["data"]["results"][0]["correct"] is False
    assert wrong.data["data"]["results"][0]["feedback"] == ["Not quite."] and wrong.data["data"]["results"][0]["correct_option_ids"]
    # Checks never block completion: with no final check the module is finished by reading.
    learner.post(f"/api/v1/training/modules/{module_id}/lessons/{lesson_id}/visit", {}, format="json")
    assert learner.post(f"/api/v1/training/modules/{module_id}/complete", **_headers()).status_code == 200

    # Question bank: add, search, learners cannot use it, archive.
    entry = {"kind": "multi", "prompt": "Which are safe?", "options": [{"text": "Gloves", "feedback": ""}, {"text": "Rings", "feedback": "Remove rings."}],
             "correct_options": ["Gloves"], "tags": ["Infection"]}
    saved = admin_client.post("/api/v1/training/question-bank", entry, format="json", **_headers())
    assert saved.status_code == 201 and saved.data["data"]["tags"] == ["infection"]
    assert len(admin_client.get("/api/v1/training/question-bank?search=safe").data["data"]) == 1
    assert learner.get("/api/v1/training/question-bank").status_code in {403, 404}
    assert admin_client.post("/api/v1/training/question-bank", {**entry, "correct_options": ["Nope"]}, format="json", **_headers()).status_code in {400, 409}
    assert admin_client.delete(f"/api/v1/training/question-bank/{saved.data['data']['id']}", **_headers()).status_code == 204
    assert admin_client.get("/api/v1/training/question-bank").data["data"] == []

    # Duplicating a module keeps checks attached to the copied lessons.
    copy = admin_client.post(f"/api/v1/training/modules/{module_id}/duplicate", **_headers()).data["data"]
    assert copy["checks"][0]["lesson_id"] == copy["lessons"][0]["id"] != lesson_id
