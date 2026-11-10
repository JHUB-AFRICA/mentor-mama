from django.db import transaction

from apps.core import audit, outbox
from apps.learning import events
from apps.core.errors import InvalidTransition
from apps.identity.models import Role, Status
from apps.learning.models import ModuleCompletion, QuizAttempt


@transaction.atomic
def submit_attempt(*, module, user, answers):
    if (user.status != Status.ACTIVE or user.role != Role.MENTOR
            or user.program_id != module.program_id
            or Role.MENTOR not in module.visible_roles):
        raise InvalidTransition("Only the assigned clinical mentor can complete training modules.")
    if not module.is_published or not hasattr(module, "quiz") or not module.quiz.questions.exists():
        raise InvalidTransition("This training module is not ready for assessment.")
    questions = list(module.quiz.questions.all())
    if set(answers) != {str(q.id) for q in questions}:
        raise InvalidTransition("Answer every quiz question before submitting.")
    correct = sum(answers[str(q.id)] == q.correct_option for q in questions)
    score = round(correct * 100 / len(questions)) if questions else 0
    attempt = QuizAttempt.objects.create(module=module, user=user, score=score, passed=score >= module.pass_mark, answers=answers)
    if attempt.passed:
        completion, created = ModuleCompletion.objects.get_or_create(module=module, user=user, defaults={"attempt": attempt, "score": score})
        if created:
            audit.record(actor=user, action="learning.module_completed", entity_table="learning_module_completion", entity_id=completion.id, scope={"program_id": str(user.program_id)}, changes={"module_id": str(module.id), "score": score})
            outbox.publish(events.ModuleCompleted(module_id=module.id, user_id=user.id))
    return attempt


@transaction.atomic
def complete_without_quiz(*, module, user):
    """Record completion of a module that has lessons but no knowledge check."""
    if (user.status != Status.ACTIVE or user.role != Role.MENTOR
            or user.program_id != module.program_id
            or Role.MENTOR not in module.visible_roles):
        raise InvalidTransition("Only the assigned clinical mentor can complete training modules.")
    if not module.is_published or not module.lessons.exists():
        raise InvalidTransition("This training module is not available.")
    if hasattr(module, "quiz") and module.quiz.questions.exists():
        raise InvalidTransition("Pass the knowledge check to complete this module.")
    existing = ModuleCompletion.objects.filter(module=module, user=user).select_related("attempt").first()
    if existing:
        return existing.attempt
    attempt = QuizAttempt.objects.create(module=module, user=user, score=100, passed=True, answers={})
    completion = ModuleCompletion.objects.create(module=module, user=user, attempt=attempt, score=100)
    audit.record(actor=user, action="learning.module_completed", entity_table="learning_module_completion", entity_id=completion.id, scope={"program_id": str(user.program_id)}, changes={"module_id": str(module.id), "score": 100, "method": "read"})
    outbox.publish(events.ModuleCompleted(module_id=module.id, user_id=user.id))
    return attempt
