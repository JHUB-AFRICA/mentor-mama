"""Facility-independent mentor learning records (POL-009—POL-011)."""

from django.db import models

from apps.core.models import BaseModel
from apps.identity.models import Role


def default_visible_roles():
    return [Role.MENTOR]


class TrainingModule(BaseModel):
    program = models.ForeignKey("identity.Program", on_delete=models.PROTECT, related_name="training_modules")
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220)
    description = models.TextField(blank=True, default="")
    pass_mark = models.PositiveSmallIntegerField(default=70)
    is_required = models.BooleanField(default=False)
    is_published = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)
    visible_roles = models.JSONField(default=default_visible_roles)
    category = models.CharField(max_length=32, default="general")
    cover_image = models.FileField(upload_to="learning/covers/", blank=True, null=True)

    class Meta:
        db_table = "learning_training_module"
        constraints = [
            models.UniqueConstraint(fields=["program", "slug"], name="learning_module_slug_per_program"),
            models.CheckConstraint(check=models.Q(pass_mark__gte=1, pass_mark__lte=100), name="learning_pass_mark_range"),
        ]


class Lesson(BaseModel):
    class LessonType(models.TextChoices):
        READING = "reading", "Reading"
        VIDEO = "video", "Video"
        CHECKLIST = "checklist", "Checklist"

    module = models.ForeignKey(TrainingModule, on_delete=models.CASCADE, related_name="lessons")
    position = models.PositiveIntegerField()
    title = models.CharField(max_length=200)
    body = models.TextField()
    lesson_type = models.CharField(max_length=24, choices=LessonType.choices, default=LessonType.READING)
    duration_minutes = models.PositiveSmallIntegerField(default=5)

    class Meta:
        db_table = "learning_lesson"
        ordering = ["position"]
        constraints = [models.UniqueConstraint(fields=["module", "position"], name="learning_lesson_position")]


class Quiz(BaseModel):
    module = models.OneToOneField(TrainingModule, on_delete=models.CASCADE, related_name="quiz")

    class Meta:
        db_table = "learning_quiz"


class QuizQuestion(BaseModel):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="questions")
    position = models.PositiveIntegerField()
    prompt = models.CharField(max_length=1000)
    options = models.JSONField(default=list)
    correct_option = models.CharField(max_length=200)

    class Meta:
        db_table = "learning_quiz_question"
        ordering = ["position"]
        constraints = [models.UniqueConstraint(fields=["quiz", "position"], name="learning_question_position")]


class QuizAttempt(BaseModel):
    module = models.ForeignKey(TrainingModule, on_delete=models.PROTECT, related_name="attempts")
    user = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="learning_attempts")
    score = models.PositiveSmallIntegerField()
    passed = models.BooleanField()
    answers = models.JSONField(default=dict)

    class Meta:
        db_table = "learning_quiz_attempt"
        indexes = [models.Index(fields=["user", "module", "-created_at"])]


class ModuleCompletion(BaseModel):
    module = models.ForeignKey(TrainingModule, on_delete=models.PROTECT, related_name="completions")
    user = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="module_completions")
    attempt = models.OneToOneField(QuizAttempt, on_delete=models.PROTECT, related_name="completion")
    score = models.PositiveSmallIntegerField()
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "learning_module_completion"
        constraints = [models.UniqueConstraint(fields=["module", "user"], name="learning_one_completion_per_user")]
