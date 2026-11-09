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
    if not module.is_published or not hasattr(module, "quiz"):
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
