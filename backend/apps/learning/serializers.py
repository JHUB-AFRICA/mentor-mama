import json

from rest_framework import serializers

from apps.learning.models import Lesson


class TrainingModuleWriteSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    pass_mark = serializers.IntegerField(min_value=1, max_value=100, default=70)
    is_required = serializers.BooleanField(default=False)
    visible_roles = serializers.ListField(child=serializers.CharField(max_length=32), required=False, default=["mentor"])
    category = serializers.CharField(max_length=32, default="general")
    cover_image = serializers.FileField(required=False, allow_null=True)
    lessons = serializers.ListField(required=False, default=list)
    quiz = serializers.ListField(required=False, default=list)

    def validate_lessons(self, value):
        for lesson in value:
            if not isinstance(lesson, dict) or not lesson.get("title") or not lesson.get("body"):
                raise serializers.ValidationError("Each lesson needs a title and body.")
            if lesson.get("lesson_type", "reading") not in Lesson.LessonType.values:
                raise serializers.ValidationError("Each lesson needs a supported lesson type.")
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
            if not isinstance(question, dict) or not question.get("prompt") or not question.get("options") or not question.get("correct_option"):
                raise serializers.ValidationError("Each quiz question needs a prompt, options and correct option.")
            options = question["options"]
            if not isinstance(options, list) or len(options) < 2 or any(not isinstance(option, str) or not option.strip() for option in options):
                raise serializers.ValidationError("Each quiz question needs at least two non-empty options.")
            if question["correct_option"] not in options:
                raise serializers.ValidationError("The correct answer must match one of the options.")
        return value


class QuizAttemptSerializer(serializers.Serializer):
    answers = serializers.DictField(child=serializers.CharField(), allow_empty=False)
