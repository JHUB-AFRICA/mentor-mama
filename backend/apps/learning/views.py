from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.core import audit
from apps.core.ai import is_configured as ai_is_configured
from apps.core.http import IdempotentCommand
from apps.learning import api, services
from apps.learning.ai import AIProviderError, explain_lesson
from apps.core.errors import InvalidTransition
from apps.learning.models import Quiz, TrainingModule
from apps.learning.serializers import LessonExplanationSerializer, QuizAttemptSerializer, TrainingModuleWriteSerializer
from apps.identity import capabilities


class LessonExplanationThrottle(SimpleRateThrottle):
    scope = "learning_ai"
    rate = "10/hour"

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        return self.cache_format % {"scope": "learning_ai", "ident": request.user.pk}


def _module_status(module):
    if module.archived_at:
        return "archived"
    return "published" if module.is_published else "draft"


def _unique_slug(program_id, title, exclude_id=None):
    base = slugify(title)[:200] or "module"
    slug, counter = base, 2
    taken = TrainingModule.objects.filter(program_id=program_id)
    if exclude_id:
        taken = taken.exclude(id=exclude_id)
    while taken.filter(slug=slug).exists():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def _module(module, user):
    completion = module.completions.filter(user=user).first()
    attempts = list(module.attempts.filter(user=user).order_by("-created_at").values_list("score", "passed")[:50])
    quiz = getattr(module, "quiz", None)
    lessons = list(module.lessons.all())
    is_admin = user.role == "program_admin"
    data = {"id": str(module.id), "title": module.title, "slug": module.slug, "description": module.description,
            "pass_mark": module.pass_mark, "is_required": module.is_required,
            "category": module.category, "visible_roles": module.visible_roles, "cover_image": module.cover_image.url if module.cover_image else "", "status": _module_status(module),
            "archived_at": module.archived_at,
            "updated_at": module.updated_at, "completed": completion is not None, "score": completion.score if completion else None,
            "completed_at": completion.completed_at if completion else None,
            "attempt_count": len(attempts), "best_score": max((score for score, _ in attempts), default=None),
            "last_score": attempts[0][0] if attempts else None, "last_passed": attempts[0][1] if attempts else None,
            "total_minutes": sum(row.duration_minutes for row in lessons),
            "has_quiz": bool(quiz and quiz.questions.exists()),
            "lessons": [{"id": str(row.id), "position": row.position, "title": row.title, "body": row.body, "lesson_type": row.lesson_type, "duration_minutes": row.duration_minutes} for row in lessons],
            "quiz": [{"id": str(row.id), "position": row.position, "prompt": row.prompt, "options": row.options, **({"correct_option": row.correct_option} if is_admin else {})} for row in quiz.questions.all()] if quiz else []}
    if is_admin:
        data["learners_completed"] = module.completions.count()
        data["learners_attempted"] = module.attempts.values("user_id").distinct().count()
    return data


def _get_module(request, module_id):
    capabilities.require(request.user, "manage_content")
    return TrainingModule.objects.filter(id=module_id, program_id=request.user.program_id).prefetch_related("lessons", "quiz__questions").first()


def _not_found():
    return Response({"error": {"code": "not_found", "message": "Training module not found."}}, status=404)


def _replace_children(module, data):
    module.lessons.all().delete()
    for position, lesson in enumerate(data["lessons"], start=1):
        module.lessons.create(position=position, title=lesson["title"], body=lesson["body"], lesson_type=lesson.get("lesson_type", "reading"), duration_minutes=lesson.get("duration_minutes", 5))
    Quiz.objects.filter(module=module).delete()
    if data["quiz"]:
        quiz = Quiz.objects.create(module=module)
        for position, question in enumerate(data["quiz"], start=1):
            quiz.questions.create(position=position, prompt=question["prompt"], options=question["options"], correct_option=question["correct_option"])


class TrainingModuleListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"data": [_module(row, request.user) for row in api.visible_modules(request.user)]})


class TrainingModuleAdminListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        capabilities.require(request.user, "manage_content")
        rows = TrainingModule.objects.filter(program_id=request.user.program_id).prefetch_related("lessons", "quiz__questions").order_by("-updated_at")
        return Response({"data": [_module(row, request.user) for row in rows]})

    def post(self, request):
        capabilities.require(request.user, "manage_content")
        payload = TrainingModuleWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        title = data["title"].strip()
        with IdempotentCommand(request, "create_training_module") as command:
            if command.replayed:
                module = TrainingModule.objects.filter(id=command.result_ref).first()
            else:
                module = TrainingModule.objects.create(program_id=request.user.program_id, title=title, slug=_unique_slug(request.user.program_id, title), description=data["description"], pass_mark=data["pass_mark"], is_required=data["is_required"], visible_roles=data["visible_roles"], category=data["category"], cover_image=data.get("cover_image"))
                _replace_children(module, data)
                audit.record(actor=request.user, action="learning.module_created", entity_table="learning_training_module", entity_id=module.id, scope={"program_id": str(request.user.program_id)}, changes={"title": title})
                command.record(module.id)
        return Response({"data": _module(module, request.user)}, status=201)


class TrainingModulePublishView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, module_id):
        module = _get_module(request, module_id)
        if module is None:
            return _not_found()
        if not module.lessons.exists():
            return Response({"error": {"code": "invalid_module", "message": "Add at least one lesson before publishing."}}, status=400)
        module.is_published = True
        module.archived_at = None
        module.save(update_fields=["is_published", "archived_at", "updated_at"])
        audit.record(actor=request.user, action="learning.module_published", entity_table="learning_training_module", entity_id=module.id, scope={"program_id": str(request.user.program_id)})
        return Response({"data": _module(module, request.user)})


class TrainingModuleUnpublishView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, module_id):
        module = _get_module(request, module_id)
        if module is None:
            return _not_found()
        module.is_published = False
        module.save(update_fields=["is_published", "updated_at"])
        audit.record(actor=request.user, action="learning.module_unpublished", entity_table="learning_training_module", entity_id=module.id, scope={"program_id": str(request.user.program_id)})
        return Response({"data": _module(module, request.user)})


class TrainingModuleArchiveView(APIView):
    """Archive hides a module from learners and keeps every completion record."""

    permission_classes = [IsAuthenticated]

    def post(self, request, module_id):
        module = _get_module(request, module_id)
        if module is None:
            return _not_found()
        restore = bool(request.data.get("restore", False))
        if restore:
            module.archived_at = None
            action = "learning.module_restored"
        else:
            module.archived_at = timezone.now()
            module.is_published = False
            action = "learning.module_archived"
        module.save(update_fields=["archived_at", "is_published", "updated_at"])
        audit.record(actor=request.user, action=action, entity_table="learning_training_module", entity_id=module.id, scope={"program_id": str(request.user.program_id)})
        return Response({"data": _module(module, request.user)})


class TrainingModuleDuplicateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, module_id):
        source = _get_module(request, module_id)
        if source is None:
            return _not_found()
        with IdempotentCommand(request, "duplicate_training_module") as command:
            if command.replayed:
                copy = TrainingModule.objects.filter(id=command.result_ref).first()
            else:
                title = f"{source.title} (copy)"[:200]
                copy = TrainingModule.objects.create(
                    program_id=source.program_id, title=title, slug=_unique_slug(source.program_id, title),
                    description=source.description, pass_mark=source.pass_mark, is_required=source.is_required,
                    visible_roles=source.visible_roles, category=source.category,
                )
                for lesson in source.lessons.all():
                    copy.lessons.create(position=lesson.position, title=lesson.title, body=lesson.body, lesson_type=lesson.lesson_type, duration_minutes=lesson.duration_minutes)
                if hasattr(source, "quiz"):
                    quiz = Quiz.objects.create(module=copy)
                    for question in source.quiz.questions.all():
                        quiz.questions.create(position=question.position, prompt=question.prompt, options=question.options, correct_option=question.correct_option)
                audit.record(actor=request.user, action="learning.module_duplicated", entity_table="learning_training_module", entity_id=copy.id, scope={"program_id": str(request.user.program_id)}, changes={"source_id": str(source.id)})
                command.record(copy.id)
        copy = TrainingModule.objects.prefetch_related("lessons", "quiz__questions").get(id=copy.id)
        return Response({"data": _module(copy, request.user)}, status=201)


class TrainingModuleReviseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, module_id):
        module = _get_module(request, module_id)
        if module is None:
            return _not_found()
        payload = TrainingModuleWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        keep_published = str(request.data.get("keep_published", "")).lower() in {"true", "1"} and module.is_published
        if keep_published and not data["lessons"]:
            raise InvalidTransition("A published module needs at least one lesson.")
        with transaction.atomic():
            module.title = data["title"].strip()
            module.slug = _unique_slug(module.program_id, module.title, exclude_id=module.id)
            module.description = data["description"]
            module.pass_mark = data["pass_mark"]
            module.is_required = data["is_required"]
            module.visible_roles = data["visible_roles"]
            module.category = data["category"]
            if data.get("cover_image"):
                module.cover_image = data["cover_image"]
            module.is_published = keep_published
            module.save()
            _replace_children(module, data)
            audit.record(actor=request.user, action="learning.module_revised", entity_table="learning_training_module", entity_id=module.id, scope={"program_id": str(request.user.program_id)}, changes={"title": module.title, "kept_published": keep_published})
        module = TrainingModule.objects.prefetch_related("lessons", "quiz__questions").get(id=module.id)
        return Response({"data": _module(module, request.user)})


class TrainingModuleDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, module_id):
        module = api.visible_modules(request.user).filter(id=module_id).first()
        if module is None and request.user.role == "program_admin":
            module = TrainingModule.objects.filter(id=module_id, program_id=request.user.program_id).prefetch_related("lessons", "quiz__questions").first()
        if module is None:
            return _not_found()
        return Response({"data": _module(module, request.user)})

    def delete(self, request, module_id):
        module = _get_module(request, module_id)
        if module is None:
            return _not_found()
        if module.is_published:
            raise InvalidTransition("Unpublish this module before deleting it.")
        if module.attempts.exists() or module.completions.exists():
            raise InvalidTransition("Learners already have records on this module, so it can be archived but not deleted.")
        title, pk = module.title, module.id
        with transaction.atomic():
            module.delete()
            audit.record(actor=request.user, action="learning.module_deleted", entity_table="learning_training_module", entity_id=pk, scope={"program_id": str(request.user.program_id)}, changes={"title": title})
        return Response(status=204)


class QuizAttemptView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, module_id):
        payload = QuizAttemptSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        module = TrainingModule.objects.filter(id=module_id, program_id=request.user.program_id).first()
        if module is None:
            return _not_found()
        attempt = services.submit_attempt(module=module, user=request.user, answers=payload.validated_data["answers"])
        return Response({"data": {"id": str(attempt.id), "score": attempt.score, "passed": attempt.passed, "pass_mark": module.pass_mark}})


class ModuleCompleteView(APIView):
    """Mark a quiz-free module as read; modules with a knowledge check must be assessed."""

    permission_classes = [IsAuthenticated]

    def post(self, request, module_id):
        module = TrainingModule.objects.filter(id=module_id, program_id=request.user.program_id).first()
        if module is None:
            return _not_found()
        attempt = services.complete_without_quiz(module=module, user=request.user)
        return Response({"data": {"id": str(attempt.id), "score": attempt.score, "passed": True, "pass_mark": module.pass_mark}})


class LessonExplanationView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [LessonExplanationThrottle]

    def post(self, request, module_id):
        if not ai_is_configured():
            return Response({"error": {"code": "ai_unavailable", "message": "Learning explanations are not available right now."}}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        payload = LessonExplanationSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        module = api.visible_modules(request.user).filter(id=module_id).first()
        if module is None:
            return Response({"error": {"code": "not_found", "message": "Training module not found."}}, status=status.HTTP_404_NOT_FOUND)
        lesson = module.lessons.filter(id=payload.validated_data["lesson_id"]).first()
        if lesson is None:
            return Response({"error": {"code": "not_found", "message": "Lesson not found."}}, status=status.HTTP_404_NOT_FOUND)
        try:
            explanation = explain_lesson(title=lesson.title, body=lesson.body)
        except AIProviderError:
            return Response({"error": {"code": "ai_unavailable", "message": "We could not create an explanation. Please try again."}}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"data": {"lesson_id": str(lesson.id), "lesson_title": lesson.title, "explanation": explanation}})


class MyTrainingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"data": api.progress(request.user)})
