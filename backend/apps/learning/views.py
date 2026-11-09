from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.learning import api, services
from apps.learning.models import Quiz, TrainingModule
from apps.learning.serializers import QuizAttemptSerializer, TrainingModuleWriteSerializer
from apps.core import audit
from apps.core.http import IdempotentCommand
from apps.identity import capabilities


def _module(module, user):
    completion = module.completions.filter(user=user).first()
    quiz = getattr(module, "quiz", None)
    return {"id": str(module.id), "title": module.title, "slug": module.slug, "description": module.description,
            "pass_mark": module.pass_mark, "is_required": module.is_required,
            "category": module.category, "visible_roles": module.visible_roles, "cover_image": module.cover_image.url if module.cover_image else "", "status": "published" if module.is_published else "draft",
            "updated_at": module.updated_at, "completed": completion is not None, "score": completion.score if completion else None,
            "lessons": [{"id": str(row.id), "position": row.position, "title": row.title, "body": row.body, "lesson_type": row.lesson_type, "duration_minutes": row.duration_minutes} for row in module.lessons.all()],
            "quiz": [{"id": str(row.id), "position": row.position, "prompt": row.prompt, "options": row.options, **({"correct_option": row.correct_option} if user.role == "program_admin" else {})} for row in quiz.questions.all()] if quiz else []}


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
        slug = "-".join(title.lower().split())
        with IdempotentCommand(request, "create_training_module") as command:
            if command.replayed:
                module = TrainingModule.objects.filter(id=command.result_ref).first()
            else:
                module = TrainingModule.objects.create(program_id=request.user.program_id, title=title, slug=slug, description=data["description"], pass_mark=data["pass_mark"], is_required=data["is_required"], visible_roles=data["visible_roles"], category=data["category"], cover_image=data.get("cover_image"))
                for position, lesson in enumerate(data["lessons"], start=1):
                    module.lessons.create(position=position, title=lesson["title"], body=lesson["body"], lesson_type=lesson.get("lesson_type", "reading"), duration_minutes=lesson.get("duration_minutes", 5))
                if data["quiz"]:
                    quiz = Quiz.objects.create(module=module)
                    for position, question in enumerate(data["quiz"], start=1):
                        quiz.questions.create(position=position, prompt=question["prompt"], options=question["options"], correct_option=question["correct_option"])
                audit.record(actor=request.user, action="learning.module_created", entity_table="learning_training_module", entity_id=module.id, scope={"program_id": str(request.user.program_id)}, changes={"title": title})
                command.record(module.id)
        return Response({"data": _module(module, request.user)}, status=201)


class TrainingModulePublishView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, module_id):
        capabilities.require(request.user, "manage_content")
        module = TrainingModule.objects.filter(
            id=module_id, program_id=request.user.program_id
        ).prefetch_related("lessons", "quiz__questions").first()
        if module is None:
            return Response(
                {"error": {"code": "not_found", "message": "Training module not found."}},
                status=404,
            )
        if not module.lessons.exists():
            return Response(
                {"error": {"code": "invalid_module", "message": "Add at least one lesson before publishing."}},
                status=400,
            )
        module.is_published = True
        module.save(update_fields=["is_published", "updated_at"])
        audit.record(
            actor=request.user,
            action="learning.module_published",
            entity_table="learning_training_module",
            entity_id=module.id,
            scope={"program_id": str(request.user.program_id)},
        )
        return Response({"data": _module(module, request.user)})


class TrainingModuleReviseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, module_id):
        capabilities.require(request.user, "manage_content")
        module = TrainingModule.objects.filter(id=module_id, program_id=request.user.program_id).first()
        if module is None:
            return Response({"error": {"code": "not_found", "message": "Training module not found."}}, status=404)
        payload = TrainingModuleWriteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        with transaction.atomic():
            module.title = data["title"].strip()
            module.slug = "-".join(module.title.lower().split())
            module.description = data["description"]
            module.pass_mark = data["pass_mark"]
            module.is_required = data["is_required"]
            module.visible_roles = data["visible_roles"]
            module.category = data["category"]
            if data.get("cover_image"):
                module.cover_image = data["cover_image"]
            module.is_published = False
            module.save()
            module.lessons.all().delete()
            for position, lesson in enumerate(data["lessons"], start=1):
                module.lessons.create(position=position, title=lesson["title"], body=lesson["body"], lesson_type=lesson.get("lesson_type", "reading"), duration_minutes=lesson.get("duration_minutes", 5))
            Quiz.objects.filter(module=module).delete()
            if data["quiz"]:
                quiz = Quiz.objects.create(module=module)
                for position, question in enumerate(data["quiz"], start=1):
                    quiz.questions.create(position=position, prompt=question["prompt"], options=question["options"], correct_option=question["correct_option"])
            audit.record(actor=request.user, action="learning.module_revised", entity_table="learning_training_module", entity_id=module.id, scope={"program_id": str(request.user.program_id)}, changes={"title": module.title})
        return Response({"data": _module(module, request.user)})


class TrainingModuleDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, module_id):
        module = api.visible_modules(request.user).filter(id=module_id).first()
        if module is None:
            return Response({"error": {"code": "not_found", "message": "Training module not found."}}, status=404)
        return Response({"data": _module(module, request.user)})


class QuizAttemptView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, module_id):
        payload = QuizAttemptSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        module = TrainingModule.objects.filter(id=module_id, program_id=request.user.program_id).first()
        if module is None:
            return Response({"error": {"code": "not_found", "message": "Training module not found."}}, status=404)
        attempt = services.submit_attempt(module=module, user=request.user, answers=payload.validated_data["answers"])
        return Response({"data": {"id": str(attempt.id), "score": attempt.score, "passed": attempt.passed, "pass_mark": module.pass_mark}})


class MyTrainingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"data": api.progress(request.user)})
