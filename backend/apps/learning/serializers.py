import json
import uuid

from rest_framework import serializers

from apps.learning.blocks import InvalidBody, validate_body
from apps.learning.models import Lesson
from apps.learning.video import parse_video_url


class TrainingModuleWriteSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    pass_mark = serializers.IntegerField(min_value=1, max_value=100, default=70)
    is_required = serializers.BooleanField(default=False)
    visible_roles = serializers.ListField(child=serializers.CharField(max_length=32), required=False, default=["mentor"])
    category = serializers.CharField(max_length=32, default="general")
    certificate_enabled = serializers.BooleanField(default=True)
    cover_image = serializers.FileField(required=False, allow_null=True)
    lessons = serializers.ListField(required=False, default=list)
    quiz = serializers.ListField(required=False, default=list)

    def validate_lessons(self, value):
        for lesson in value:
            if not isinstance(lesson, dict) or not lesson.get("title") or not lesson.get("body"):
                raise serializers.ValidationError("Each lesson needs a title and body.")
            if lesson.get("lesson_type", "reading") not in Lesson.LessonType.values:
                raise serializers.ValidationError("Each lesson needs a supported lesson type.")
            try:
                validate_body(str(lesson["body"]))
            except InvalidBody as error:
                raise serializers.ValidationError(str(error)) from error
            if len(str(lesson.get("section", ""))) > 120:
                raise serializers.ValidationError("Section names must be 120 characters or fewer.")
            video_url = lesson.get("video_url", "")
            if video_url and parse_video_url(video_url) is None:
                raise serializers.ValidationError("Use a YouTube or Vimeo link for the video.")
            if lesson.get("lesson_type") == "video" and not video_url:
                raise serializers.ValidationError("A video lesson needs a YouTube or Vimeo link.")
            if not isinstance(lesson.get("duration_minutes", 5), int) or not 1 <= lesson.get("duration_minutes", 5) <= 600:
                raise serializers.ValidationError("Each lesson duration must be between 1 and 600 minutes.")
        return value

    def to_internal_value(self, data):
        if hasattr(data, "getlist"):
            # QueryDict assignments stringify nested lists/dicts. Normalize
            # multipart form values to a plain mapping before decoding JSON.
            data = {key: data.get(key) for key in data}
        else:
            data = data.copy()
        for field in ("visible_roles", "lessons", "quiz"):
            value = data.get(field)
            if isinstance(value, str):
                try:
                    data[field] = json.loads(value)
                except json.JSONDecodeError:
                    pass
        return super().to_internal_value(data)

    def validate_cover_image(self, value):
        if value and (not value.content_type.startswith("image/") or value.size > 2 * 1024 * 1024):
            raise serializers.ValidationError("Choose an image file smaller than 2MB.")
        return value

    def validate_quiz(self, value):
        for question in value:
            validate_question(question)
            lesson_id = question.get("lesson_id")
            if lesson_id:
                try:
                    uuid.UUID(str(lesson_id))
                except ValueError as error:
                    raise serializers.ValidationError("A lesson check points at an unknown lesson.") from error
        return value

    def validate(self, attrs):
        lesson_ids = {str(lesson.get("id")) for lesson in attrs.get("lessons", []) if lesson.get("id")}
        for question in attrs.get("quiz", []):
            if question.get("lesson_id") and str(question["lesson_id"]) not in lesson_ids:
                raise serializers.ValidationError({"quiz": "A lesson check points at a lesson that is not in this module."})
        return attrs


def validate_question(question):
    if not isinstance(question, dict) or not str(question.get("prompt", "")).strip():
        raise serializers.ValidationError("Each quiz question needs a prompt.")
    kind = question.get("kind", "single")
    if kind not in {"single", "multi", "true_false"}:
        raise serializers.ValidationError("Unknown question type.")
    options = question.get("options")
    texts = [o.get("text") if isinstance(o, dict) else o for o in options] if isinstance(options, list) else []
    if len(texts) < 2 or len(texts) > 8 or any(not isinstance(text, str) or not text.strip() for text in texts):
        raise serializers.ValidationError("Each quiz question needs between two and eight non-empty options.")
    if len({t.strip() for t in texts}) != len(texts):
        raise serializers.ValidationError("Answer options must be different from each other.")
    if kind == "true_false" and len(texts) != 2:
        raise serializers.ValidationError("True/False questions have exactly two answers.")
    ids = [o.get("id") for o in options if isinstance(o, dict) and o.get("id")]
    wanted = question.get("correct_options")
    if wanted is None:
        wanted = [question["correct_option"]] if question.get("correct_option") else []
    if not isinstance(wanted, list) or not wanted or not all(isinstance(w, str) for w in wanted):
        raise serializers.ValidationError("Mark the correct answer for each question.")
    if not all(w in texts or w in ids for w in wanted):
        raise serializers.ValidationError("The correct answer must match one of the options.")
    if kind != "multi" and len(wanted) != 1:
        raise serializers.ValidationError("This question type has exactly one correct answer.")
    for field in ("scenario", "explanation"):
        if len(str(question.get(field, ""))) > 2000:
            raise serializers.ValidationError("Case descriptions and explanations must be 2000 characters or fewer.")


class QuizAttemptSerializer(serializers.Serializer):
    answers = serializers.DictField(child=serializers.JSONField(), allow_empty=False)

    def validate_answers(self, value):
        for answer in value.values():
            ok = isinstance(answer, str) or (isinstance(answer, list) and answer and all(isinstance(a, str) for a in answer))
            if not ok:
                raise serializers.ValidationError("Each answer must be one choice, or a list of choices.")
        return value


class LessonExplanationSerializer(serializers.Serializer):
    lesson_id = serializers.UUIDField()
