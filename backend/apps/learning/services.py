from django.db import transaction

from apps.core import audit, outbox
from apps.learning import certificates, events, versioning
from apps.core.errors import InvalidTransition
from apps.identity.models import Status
from apps.learning.models import LessonProgress, ModuleCompletion, QuizAttempt


def _final_questions(snapshot):
    """Questions of the final knowledge check (checks tied to a lesson are formative only)."""
    return [q for q in snapshot["quiz"] if not q.get("lesson_id")]


def _require_assigned(module, user):
    if user.status != Status.ACTIVE or user.program_id != module.program_id or user.role not in module.visible_roles:
        raise InvalidTransition("This training module is not assigned to your role.")


@transaction.atomic
def submit_attempt(*, module, user, answers):
    _require_assigned(module, user)
    snapshot, version = versioning.content_for(module, user)
    questions = _final_questions(snapshot)
    if not module.is_published or not questions:
        raise InvalidTransition("This training module is not ready for assessment.")
    if set(answers) != {q["id"] for q in questions}:
        raise InvalidTransition("Answer every quiz question before submitting.")
    graded = {q["id"]: versioning.grade(q, answers[q["id"]]) for q in questions}
    resolved = {qid: sorted(chosen) if isinstance(answers[qid], list) else (next(iter(chosen), None)) for qid, (chosen, _) in graded.items()}
    correct = sum(ok for _, ok in graded.values())
    score = round(correct * 100 / len(questions))
    passed = score >= snapshot["pass_mark"]
    attempt = QuizAttempt.objects.create(module=module, user=user, score=score, passed=passed, answers=resolved, version=version)
    if passed:
        completion, created = ModuleCompletion.objects.get_or_create(
            module=module, user=user, defaults={"attempt": attempt, "score": score, "version": version})
        if not created and completion.version < version:
            # A fresh pass on a newer version refreshes the evidence; the older attempt stays on record.
            completion.attempt, completion.score, completion.version = attempt, score, version
            completion.save(update_fields=["attempt", "score", "version", "updated_at"])
            created = True
        if created:
            audit.record(actor=user, action="learning.module_completed", entity_table="learning_module_completion", entity_id=completion.id, scope={"program_id": str(user.program_id)}, changes={"module_id": str(module.id), "score": score, "version": version})
            outbox.publish(events.ModuleCompleted(module_id=module.id, user_id=user.id))
            certificates.issue_for_completion(completion)
    attempt.results = _results(questions, graded, passed)
    return attempt


def _results(questions, graded, passed):
    """Per-question feedback. The right answers are revealed only once the module is passed."""
    rows = []
    for q in questions:
        chosen, ok = graded[q["id"]]
        feedback = q.get("option_feedback") or [""] * len(q["option_ids"])
        said = [feedback[q["option_ids"].index(c)] for c in sorted(chosen) if c in q["option_ids"] and feedback[q["option_ids"].index(c)]]
        row = {"question_id": q["id"], "correct": ok, "explanation": q.get("explanation", ""), "feedback": said}
        if passed:
            row["correct_option_ids"] = sorted(versioning.correct_ids(q))
        rows.append(row)
    return rows


@transaction.atomic
def complete_without_quiz(*, module, user):
    """Record completion of a module that has lessons but no knowledge check."""
    _require_assigned(module, user)
    snapshot, version = versioning.content_for(module, user)
    if not module.is_published or not snapshot["lessons"]:
        raise InvalidTransition("This training module is not available.")
    if _final_questions(snapshot):
        raise InvalidTransition("Pass the knowledge check to complete this module.")
    existing = ModuleCompletion.objects.filter(module=module, user=user).select_related("attempt").first()
    if existing and existing.version >= version:
        return existing.attempt
    lesson_ids = {lesson["id"] for lesson in snapshot["lessons"]}
    opened = {str(key) for key in LessonProgress.objects.filter(user=user, module=module).values_list("lesson_key", flat=True)}
    if not lesson_ids <= opened:
        raise InvalidTransition("Open every lesson before marking this module as complete.")
    attempt = QuizAttempt.objects.create(module=module, user=user, score=100, passed=True, answers={}, version=version)
    if existing:
        existing.attempt, existing.score, existing.version = attempt, 100, version
        existing.save(update_fields=["attempt", "score", "version", "updated_at"])
        completion = existing
    else:
        completion = ModuleCompletion.objects.create(module=module, user=user, attempt=attempt, score=100, version=version)
    audit.record(actor=user, action="learning.module_completed", entity_table="learning_module_completion", entity_id=completion.id, scope={"program_id": str(user.program_id)}, changes={"module_id": str(module.id), "score": 100, "method": "read", "version": version})
    outbox.publish(events.ModuleCompleted(module_id=module.id, user_id=user.id))
    certificates.issue_for_completion(completion)
    return attempt


def record_lesson_visit(*, module, lesson_id, user):
    """Remember that this person opened a lesson of the version they are on (idempotent)."""
    _require_assigned(module, user)
    snapshot, version = versioning.content_for(module, user)
    if not module.is_published or module.archived_at or str(lesson_id) not in {x["id"] for x in snapshot["lessons"]}:
        raise InvalidTransition("This lesson is not available.")
    LessonProgress.objects.get_or_create(user=user, lesson_key=lesson_id, defaults={"module": module, "version": version})


def check_lesson(*, module, user, lesson_id, answers):
    """Grade a lesson's own questions for immediate feedback. Nothing is stored and completion is unaffected."""
    _require_assigned(module, user)
    snapshot, _ = versioning.content_for(module, user)
    if not module.is_published or module.archived_at:
        raise InvalidTransition("This lesson is not available.")
    questions = [q for q in snapshot["quiz"] if q.get("lesson_id") == str(lesson_id)]
    if not questions or set(answers) != {q["id"] for q in questions}:
        raise InvalidTransition("Answer every question for this lesson.")
    graded = {q["id"]: versioning.grade(q, answers[q["id"]]) for q in questions}
    # Practice only, so the right answers are always shown.
    return _results(questions, graded, passed=True)
