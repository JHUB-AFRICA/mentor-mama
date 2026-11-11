import mimetypes
import uuid
from pathlib import Path

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from django.utils.text import slugify
from django.http import FileResponse, HttpResponse
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.core import audit
from apps.core.ai import is_configured as ai_is_configured
from apps.core.http import IdempotentCommand
from apps.learning import api, certificates, services, versioning
from apps.learning.ai import AIProviderError, explain_lesson
from apps.core.errors import InvalidTransition
from apps.learning.text import plain_text
from apps.learning.video import parse_video_url
from apps.learning.models import BankQuestion, Certificate, Lesson, LessonProgress, MediaAsset, Quiz, TrainingModule
from apps.learning.serializers import LessonExplanationSerializer, QuizAttemptSerializer, TrainingModuleWriteSerializer, validate_question
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


def _free_lesson_id(value):
    try:
        return not Lesson.objects.filter(id=uuid.UUID(str(value))).exists()
    except ValueError:
        return False


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


def _lesson_row(row):
    return {"id": row["id"], "position": row["position"], "title": row["title"], "body": row["body"],
            "lesson_type": row["lesson_type"], "duration_minutes": row["duration_minutes"],
            "video_url": row.get("video_url", ""), "video": parse_video_url(row.get("video_url", "")),
            "section": row.get("section", "")}


def _module(module, user):
    """Admins see the editable working copy; everyone else sees the version they are on."""
    completion = module.completions.filter(user=user).first()
    attempts = list(module.attempts.filter(user=user).order_by("-created_at").values_list("score", "passed")[:50])
    is_admin = user.role == "program_admin"
    latest = versioning.latest_version(module)
    snapshot = versioning.build_snapshot(module) if is_admin else versioning.content_for(module, user)[0]
    version_number = latest.number if (is_admin and latest) else (None if is_admin else versioning.content_for(module, user)[1])
    quiz, checks = [], []
    for row in snapshot["quiz"]:
        feedback = row.get("option_feedback") or [""] * len(row["option_ids"])
        item = {"id": row["id"], "position": row["position"], "prompt": row["prompt"], "options": row["options"],
                "kind": row.get("kind", "single"), "scenario": row.get("scenario", ""),
                "choices": [{"id": i, "text": t, **({"feedback": f} if is_admin else {})} for i, t, f in zip(row["option_ids"], row["options"], feedback)]}
        if is_admin:
            item["explanation"] = row.get("explanation", "")
            item["correct_option_ids"] = sorted(versioning.correct_ids(row))
            item["correct_option_id"] = row["correct_option_id"]
            item["correct_option"] = row["options"][row["option_ids"].index(row["correct_option_id"])] if row["correct_option_id"] in row["option_ids"] else ""
        if row.get("lesson_id"):
            item["lesson_id"] = row["lesson_id"]
            checks.append(item)
        else:
            quiz.append(item)
    lessons = [_lesson_row(row) for row in snapshot["lessons"]]
    visited = [str(v) for v in LessonProgress.objects.filter(user=user, module=module).values_list("lesson_key", flat=True)]
    data = {"id": str(module.id), "title": snapshot["title"] if not is_admin else module.title, "slug": module.slug,
            "description": snapshot["description"] if not is_admin else module.description,
            "pass_mark": snapshot["pass_mark"] if not is_admin else module.pass_mark, "is_required": module.is_required,
            "category": module.category, "visible_roles": module.visible_roles, "certificate_enabled": module.certificate_enabled,
            "cover_image": f"/api/v1/training/modules/{module.id}/cover" if module.cover_image else "",
            "status": _module_status(module), "archived_at": module.archived_at, "updated_at": module.updated_at,
            "completed": completion is not None, "score": completion.score if completion else None,
            "completed_at": completion.completed_at if completion else None,
            "completed_version": completion.version if completion else None,
            "needs_refresh": bool(completion and not versioning.completion_counts(module, completion)),
            "version": version_number,
            "attempt_count": len(attempts), "best_score": max((score for score, _ in attempts), default=None),
            "last_score": attempts[0][0] if attempts else None, "last_passed": attempts[0][1] if attempts else None,
            "total_minutes": sum(row["duration_minutes"] for row in lessons),
            "has_quiz": bool(quiz), "visited_lesson_ids": visited, "lessons": lessons, "quiz": quiz, "checks": checks}
    if is_admin:
        data["learners_completed"] = module.completions.count()
        data["learners_attempted"] = module.attempts.values("user_id").distinct().count()
        data["has_unpublished_changes"] = module.is_published and versioning.has_unpublished_changes(module)
        data["version_count"] = module.versions.count()
    return data


def _get_module(request, module_id):
    capabilities.require(request.user, "manage_content")
    return TrainingModule.objects.filter(id=module_id, program_id=request.user.program_id).prefetch_related("lessons", "quiz__questions").first()


def _not_found():
    return Response({"error": {"code": "not_found", "message": "Training module not found."}}, status=404)


def _replace_children(module, data):
    # Update lessons in place (matched by id) so learner progress and version history stay attached.
    current = {str(row.id): row for row in module.lessons.all()}
    module.lessons.update(position=F("position") + 100000)
    kept = set()
    for position, lesson in enumerate(data["lessons"], start=1):
        fields = {"title": lesson["title"], "body": lesson["body"], "lesson_type": lesson.get("lesson_type", "reading"),
                  "duration_minutes": lesson.get("duration_minutes", 5), "video_url": lesson.get("video_url", ""), "section": str(lesson.get("section", ""))[:120].strip(), "position": position}
        row = current.get(str(lesson.get("id")))
        if row is None:
            wanted = lesson.get("id")
            extra = {"id": wanted} if wanted and _free_lesson_id(wanted) else {}
            row = module.lessons.create(**extra, **fields)
        else:
            for key, value in fields.items():
                setattr(row, key, value)
            row.save()
        kept.add(str(row.id))
    module.lessons.exclude(id__in=kept).delete()
    lesson_ids = {str(row.id) for row in module.lessons.all()}
    existing = list(module.quiz.questions.order_by("position")) if hasattr(module, "quiz") else []
    if not data["quiz"]:
        Quiz.objects.filter(module=module).delete()
        return
    quiz, _ = Quiz.objects.get_or_create(module=module)
    by_id = {str(row.id): row for row in existing}
    kept = set()
    quiz.questions.update(position=F("position") + 100000)
    for position, payload in enumerate(data["quiz"], start=1):
        # Match by id; legacy payloads without ids fall back to the question at the same position.
        old = by_id.get(str(payload.get("id"))) or (existing[position - 1] if not payload.get("id") and position <= len(existing) and str(existing[position - 1].id) not in kept else None)
        kind = payload.get("kind", "single")
        texts, ids, feedback = [], [], []
        for option in payload["options"]:
            text = (option["text"] if isinstance(option, dict) else option).strip()
            option_id = option.get("id") if isinstance(option, dict) else None
            if not option_id and old and text in old.options:
                option_id = old.option_ids[old.options.index(text)]
            texts.append(text)
            ids.append(option_id if option_id and option_id not in ids else str(uuid.uuid4()))
            feedback.append(str(option.get("feedback", "")).strip() if isinstance(option, dict) else "")
        wanted = payload.get("correct_options")
        if wanted is None:
            wanted = [payload["correct_option"]]
        correct_ids = [ids[i] for i, (option_id, text) in enumerate(zip(ids, texts)) if option_id in wanted or text in wanted]
        fields = {"prompt": payload["prompt"].strip(), "options": texts, "option_ids": ids, "option_feedback": feedback,
                  "kind": kind, "scenario": str(payload.get("scenario", "")).strip(), "explanation": str(payload.get("explanation", "")).strip(),
                  "correct_option": texts[ids.index(correct_ids[0])], "correct_option_ids": correct_ids,
                  "lesson_key": payload.get("lesson_id") if str(payload.get("lesson_id")) in lesson_ids else None}
        if old:
            for key, value in fields.items():
                setattr(old, key, value)
            old.position = position
            old.save()
            kept.add(str(old.id))
        else:
            kept.add(str(quiz.questions.create(position=position, **fields).id))
    quiz.questions.exclude(id__in=kept).delete()


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
                module = TrainingModule.objects.create(program_id=request.user.program_id, title=title, slug=_unique_slug(request.user.program_id, title), description=data["description"], pass_mark=data["pass_mark"], is_required=data["is_required"], visible_roles=data["visible_roles"], category=data["category"], certificate_enabled=data["certificate_enabled"], cover_image=data.get("cover_image"))
                _replace_children(module, data)
                audit.record(actor=request.user, action="learning.module_created", entity_table="learning_training_module", entity_id=module.id, scope={"program_id": str(request.user.program_id)}, changes={"title": title})
                command.record(module.id)
        return Response({"data": _module(module, request.user)}, status=201)


class TrainingModulePublishView(APIView):
    """Publish the working copy as a new immutable version (minor or major)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, module_id):
        module = _get_module(request, module_id)
        if module is None:
            return _not_found()
        version = versioning.publish(
            module=module, user=request.user,
            change_kind=str(request.data.get("change_kind", "major")), change_note=str(request.data.get("change_note", "")))
        audit.record(actor=request.user, action="learning.module_published", entity_table="learning_training_module", entity_id=module.id, scope={"program_id": str(request.user.program_id)}, changes={"version": version.number, "change_kind": version.change_kind})
        return Response({"data": _module(module, request.user)})


class TrainingModuleVersionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, module_id):
        module = _get_module(request, module_id)
        if module is None:
            return _not_found()
        return Response({"data": [
            {"number": v.number, "change_kind": v.change_kind, "change_note": v.change_note, "published_at": v.published_at,
             "published_by": (v.published_by.full_name or v.published_by.email) if v.published_by else "",
             "lessons": len(v.snapshot.get("lessons", [])), "questions": len(v.snapshot.get("quiz", [])),
             "learners_completed": module.completions.filter(version=v.number).count()}
            for v in module.versions.select_related("published_by")]})


class TrainingModuleVersionRestoreView(APIView):
    """Copy an earlier version back into the editable working copy (it is not published until you publish)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, module_id, number):
        module = _get_module(request, module_id)
        version = module.versions.filter(number=number).first() if module else None
        if version is None:
            return _not_found()
        snap = version.snapshot
        data = {
            "lessons": [{k: lesson.get(k) for k in ("id", "title", "body", "lesson_type", "duration_minutes", "video_url", "section") if lesson.get(k) is not None} for lesson in snap["lessons"]],
            "quiz": [{"id": q["id"], "lesson_id": q.get("lesson_id"), "kind": q.get("kind", "single"), "scenario": q.get("scenario", ""), "explanation": q.get("explanation", ""), "prompt": q["prompt"],
                      "options": [{"id": i, "text": t, "feedback": f} for i, t, f in zip(q["option_ids"], q["options"], q.get("option_feedback") or [""] * len(q["options"]))],
                      "correct_options": sorted(versioning.correct_ids(q))} for q in snap["quiz"]],
        }
        with transaction.atomic():
            module.title, module.description, module.pass_mark = snap["title"], snap["description"], snap["pass_mark"]
            module.save(update_fields=["title", "description", "pass_mark", "updated_at"])
            _replace_children(module, data)
            audit.record(actor=request.user, action="learning.module_version_restored", entity_table="learning_training_module", entity_id=module.id, scope={"program_id": str(request.user.program_id)}, changes={"version": number})
        module = TrainingModule.objects.prefetch_related("lessons", "quiz__questions").get(id=module.id)
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
                    visible_roles=source.visible_roles, category=source.category, certificate_enabled=source.certificate_enabled,
                )
                if source.cover_image:
                    with source.cover_image.open("rb") as handle:
                        copy.cover_image.save(Path(source.cover_image.name).name, ContentFile(handle.read()), save=True)
                lesson_map = {}
                for lesson in source.lessons.all():
                    created_lesson = copy.lessons.create(position=lesson.position, title=lesson.title, body=lesson.body, lesson_type=lesson.lesson_type, duration_minutes=lesson.duration_minutes, video_url=lesson.video_url, section=lesson.section)
                    lesson_map[lesson.id] = created_lesson.id
                if hasattr(source, "quiz"):
                    quiz = Quiz.objects.create(module=copy)
                    for question in source.quiz.questions.all():
                        quiz.questions.create(position=question.position, prompt=question.prompt, options=question.options, correct_option=question.correct_option,
                                              kind=question.kind, scenario=question.scenario, explanation=question.explanation,
                                              option_feedback=question.option_feedback, correct_option_ids=[],
                                              lesson_key=lesson_map.get(question.lesson_key))
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
            module.certificate_enabled = data["certificate_enabled"]
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
        return Response({"data": {"id": str(attempt.id), "score": attempt.score, "passed": attempt.passed, "pass_mark": module.pass_mark, "results": getattr(attempt, "results", [])}})


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
        snapshot, _ = versioning.content_for(module, request.user)
        lesson = next((row for row in snapshot["lessons"] if row["id"] == str(payload.validated_data["lesson_id"])), None)
        if lesson is None:
            return Response({"error": {"code": "not_found", "message": "Lesson not found."}}, status=status.HTTP_404_NOT_FOUND)
        try:
            explanation = explain_lesson(title=lesson["title"], body=plain_text(lesson["body"]))
        except AIProviderError:
            return Response({"error": {"code": "ai_unavailable", "message": "We could not create an explanation. Please try again."}}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"data": {"lesson_id": lesson["id"], "lesson_title": lesson["title"], "explanation": explanation}})


class MyTrainingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"data": api.progress(request.user)})


class TrainingModuleCoverView(APIView):
    """Module covers are private: served only to people who may see the module."""

    permission_classes = [IsAuthenticated]

    def get(self, request, module_id):
        module = TrainingModule.objects.filter(id=module_id, program_id=request.user.program_id).first()
        if module is not None and request.user.role != "program_admin":
            module = api.visible_modules(request.user).filter(id=module_id).first()
        if module is None or not module.cover_image:
            return _not_found()
        content_type = mimetypes.guess_type(module.cover_image.name)[0] or "application/octet-stream"
        response = FileResponse(module.cover_image.open("rb"), content_type=content_type)
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store"
        return response


class LessonVisitView(APIView):
    """Save that the signed-in person opened a lesson, so progress follows them to any device."""

    permission_classes = [IsAuthenticated]

    def post(self, request, module_id, lesson_id):
        module = TrainingModule.objects.filter(id=module_id, program_id=request.user.program_id).first()
        if module is None:
            return _not_found()
        services.record_lesson_visit(module=module, lesson_id=lesson_id, user=request.user)
        return Response({"data": {"lesson_id": str(lesson_id), "visited": True}})


class LessonMediaView(APIView):
    """Upload (authors) and read (signed-in people of the programme) lesson images."""

    permission_classes = [IsAuthenticated]
    MAX_BYTES = 2 * 1024 * 1024

    def post(self, request):
        capabilities.require(request.user, "manage_content")
        upload, alt = request.FILES.get("file"), str(request.data.get("alt", "")).strip()[:200]
        if upload is None or not alt:
            raise InvalidTransition("Choose an image and describe it in a few words for screen readers.")
        if upload.size > self.MAX_BYTES:
            raise InvalidTransition("Choose an image smaller than 2MB.")
        from PIL import Image, UnidentifiedImageError

        try:
            with Image.open(upload) as picture:
                picture.verify()
            upload.seek(0)
            with Image.open(upload) as picture:
                kind, (width, height) = (picture.format or "").upper(), picture.size
        except (UnidentifiedImageError, OSError, SyntaxError) as error:
            raise InvalidTransition("That file is not a readable image.") from error
        content_type = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp", "GIF": "image/gif"}.get(kind)
        if content_type is None or width * height > 40_000_000:
            raise InvalidTransition("Use a PNG, JPG, WEBP or GIF image of reasonable size.")
        upload.seek(0)
        asset = MediaAsset.objects.create(program_id=request.user.program_id, file=upload, content_type=content_type,
                                          alt=alt, width=width, height=height, created_by=request.user)
        audit.record(actor=request.user, action="learning.media_uploaded", entity_table="learning_media_asset", entity_id=asset.id, scope={"program_id": str(request.user.program_id)})
        return Response({"data": {"id": str(asset.id), "url": f"/api/v1/training/media/{asset.id}", "alt": asset.alt, "width": width, "height": height}}, status=201)


class LessonMediaFileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, media_id):
        asset = MediaAsset.objects.filter(id=media_id, program_id=request.user.program_id).first()
        if asset is None:
            return _not_found()
        response = FileResponse(asset.file.open("rb"), content_type=asset.content_type)
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, max-age=3600"
        return response


class ModuleCertificateView(APIView):
    """The signed-in person's own certificate of completion for a module, as a PDF."""

    permission_classes = [IsAuthenticated]

    def get(self, request, module_id):
        module = TrainingModule.objects.filter(id=module_id, program_id=request.user.program_id).first()
        certificate = certificates.latest_for(request.user, module) if module else None
        if certificate is None:
            return Response({"error": {"code": "not_found", "message": "Complete this module to receive a certificate."}}, status=404)
        pdf = certificates.certificate_pdf(certificate)
        response = HttpResponse(pdf, content_type="application/pdf")
        slug = slugify(certificate.module_title)[:60] or "module"
        response["Content-Disposition"] = f'attachment; filename="mentormama-certificate-{slug}.pdf"'
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class CertificateVerifyView(APIView):
    """Programme administrators can confirm a certificate number is genuine."""

    permission_classes = [IsAuthenticated]

    def get(self, request, number):
        capabilities.require(request.user, "manage_content")
        certificate = Certificate.objects.filter(number=number.upper(), module__program_id=request.user.program_id).first()
        if certificate is None:
            return Response({"data": {"valid": False}})
        return Response({"data": {"valid": True, "number": certificate.number, "learner_name": certificate.learner_name,
                                  "module_title": certificate.module_title, "version": certificate.version,
                                  "completed_at": certificate.completed_at, "issued_at": certificate.issued_at}})


class LessonCheckView(APIView):
    """Formative check after a lesson: immediate feedback, nothing is recorded and completion is unaffected."""

    permission_classes = [IsAuthenticated]

    def post(self, request, module_id, lesson_id):
        payload = QuizAttemptSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        module = TrainingModule.objects.filter(id=module_id, program_id=request.user.program_id).first()
        if module is None:
            return _not_found()
        results = services.check_lesson(module=module, user=request.user, lesson_id=lesson_id, answers=payload.validated_data["answers"])
        return Response({"data": {"results": results}})


def _bank_row(row):
    return {"id": str(row.id), "kind": row.kind, "scenario": row.scenario, "prompt": row.prompt, "explanation": row.explanation,
            "options": row.options, "correct_options": row.correct, "tags": row.tags, "created_at": row.created_at}


class QuestionBankView(APIView):
    """Reusable questions for authors. Using one in a module copies it."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        capabilities.require(request.user, "manage_content")
        rows = BankQuestion.objects.filter(program_id=request.user.program_id, archived_at=None)
        search = request.query_params.get("search", "").strip()
        if search:
            rows = rows.filter(Q(prompt__icontains=search) | Q(scenario__icontains=search) | Q(tags__icontains=search.lower()))
        kind = request.query_params.get("kind", "")
        if kind:
            rows = rows.filter(kind=kind)
        return Response({"data": [_bank_row(row) for row in rows[:200]]})

    def post(self, request):
        capabilities.require(request.user, "manage_content")
        question = {
            "kind": request.data.get("kind", "single"), "scenario": request.data.get("scenario", ""),
            "prompt": request.data.get("prompt", ""), "explanation": request.data.get("explanation", ""),
            "options": request.data.get("options", []), "correct_options": request.data.get("correct_options", []),
        }
        try:
            validate_question(question)
        except serializers.ValidationError as error:
            raise InvalidTransition(str(error.detail[0])) from error
        tags = [str(t).strip().lower()[:30] for t in (request.data.get("tags") or []) if str(t).strip()][:8]
        options = [{"text": (o["text"] if isinstance(o, dict) else o).strip(), "feedback": str(o.get("feedback", "")).strip() if isinstance(o, dict) else ""} for o in question["options"]]
        row = BankQuestion.objects.create(
            program_id=request.user.program_id, created_by=request.user, kind=question["kind"], scenario=str(question["scenario"]).strip(),
            prompt=question["prompt"].strip(), explanation=str(question["explanation"]).strip(), options=options,
            correct=[c.strip() for c in question["correct_options"]], tags=tags)
        audit.record(actor=request.user, action="learning.bank_question_added", entity_table="learning_bank_question", entity_id=row.id, scope={"program_id": str(request.user.program_id)})
        return Response({"data": _bank_row(row)}, status=201)


class QuestionBankDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, question_id):
        capabilities.require(request.user, "manage_content")
        row = BankQuestion.objects.filter(id=question_id, program_id=request.user.program_id, archived_at=None).first()
        if row is None:
            return _not_found()
        row.archived_at = timezone.now()
        row.save(update_fields=["archived_at", "updated_at"])
        return Response(status=204)
