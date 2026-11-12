"""Facility-independent mentor learning records (POL-009—POL-011)."""

import os
import uuid

from django.db import models

from apps.core.models import BaseModel
from apps.core.storage import private_storage
from apps.identity.models import Role


def private_media_storage():
    """Kept by name because migrations reference it; every upload uses the shared private storage."""
    return private_storage()


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
    certificate_enabled = models.BooleanField(default=True)
    cover_image = models.FileField(upload_to="learning/covers/", storage=private_media_storage, blank=True, null=True)

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
    video_url = models.URLField(max_length=300, blank=True, default="")
    section = models.CharField(max_length=120, blank=True, default="")

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
    # Stable ids parallel to ``options`` so scoring and past attempts survive wording edits.
    option_ids = models.JSONField(default=list)
    correct_option = models.CharField(max_length=200)
    correct_option_id = models.CharField(max_length=36, blank=True, default="")

    class Kind(models.TextChoices):
        SINGLE = "single", "Single choice"
        MULTI = "multi", "Multiple select"
        TRUE_FALSE = "true_false", "True / False"

    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.SINGLE)
    scenario = models.TextField(blank=True, default="")
    explanation = models.TextField(blank=True, default="")
    option_feedback = models.JSONField(default=list)  # parallel to options; "" when none
    correct_option_ids = models.JSONField(default=list)  # authoritative for multi; [correct_option_id] otherwise
    #: Set for a check shown after one lesson (formative, never affects completion); empty for the final check.
    lesson_key = models.UUIDField(null=True, blank=True)

    def save(self, *args, **kwargs):
        self.ensure_option_ids()
        super().save(*args, **kwargs)

    def ensure_option_ids(self):
        if len(self.option_ids) != len(self.options):
            self.option_ids = [str(uuid.uuid4()) for _ in self.options]
        if len(self.option_feedback) != len(self.options):
            self.option_feedback = (list(self.option_feedback) + [""] * len(self.options))[: len(self.options)]
        if self.kind == self.Kind.MULTI and self.correct_option_ids:
            self.correct_option_id = self.correct_option_ids[0]
            if self.correct_option_id in self.option_ids:
                self.correct_option = self.options[self.option_ids.index(self.correct_option_id)]
        elif self.correct_option in self.options:
            self.correct_option_id = self.option_ids[self.options.index(self.correct_option)]
            self.correct_option_ids = [self.correct_option_id]

    def choices(self):
        return [{"id": option_id, "text": text} for option_id, text in zip(self.option_ids, self.options)]

    def resolve_answer(self, answer):
        """Map a submitted answer (option id, or legacy option text) to an option id, or None."""
        if answer in self.option_ids:
            return answer
        if answer in self.options:
            return self.option_ids[self.options.index(answer)]
        return None

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
    version = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "learning_quiz_attempt"
        indexes = [models.Index(fields=["user", "module", "-created_at"])]


class ModuleCompletion(BaseModel):
    module = models.ForeignKey(TrainingModule, on_delete=models.PROTECT, related_name="completions")
    user = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="module_completions")
    attempt = models.OneToOneField(QuizAttempt, on_delete=models.PROTECT, related_name="completion")
    score = models.PositiveSmallIntegerField()
    completed_at = models.DateTimeField(auto_now_add=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "learning_module_completion"
        constraints = [models.UniqueConstraint(fields=["module", "user"], name="learning_one_completion_per_user")]


class LessonProgress(BaseModel):
    """A lesson a person has opened; saved on the server so progress follows them across devices.

    ``lesson_key`` is a plain id (no foreign key) so records survive the lesson later being
    removed from the editable working copy: the version the person learned is the evidence.
    """

    user = models.ForeignKey("identity.User", on_delete=models.CASCADE, related_name="lesson_progress")
    module = models.ForeignKey(TrainingModule, on_delete=models.CASCADE, related_name="lesson_progress")
    lesson_key = models.UUIDField()
    version = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "learning_lesson_progress"
        constraints = [models.UniqueConstraint(fields=["user", "lesson_key"], name="learning_one_progress_per_lesson")]


class ModuleVersion(BaseModel):
    """An immutable published snapshot of a module. Learners finish the version they started."""

    class ChangeKind(models.TextChoices):
        MINOR = "minor", "Minor (wording or typo)"
        MAJOR = "major", "Major (content changed)"

    module = models.ForeignKey(TrainingModule, on_delete=models.CASCADE, related_name="versions")
    number = models.PositiveIntegerField()
    change_kind = models.CharField(max_length=8, choices=ChangeKind.choices, default=ChangeKind.MAJOR)
    change_note = models.CharField(max_length=500, blank=True, default="")
    published_at = models.DateTimeField(auto_now_add=True)
    published_by = models.ForeignKey("identity.User", on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    snapshot = models.JSONField(default=dict)
    content_hash = models.CharField(max_length=64)

    class Meta:
        db_table = "learning_module_version"
        ordering = ["-number"]
        constraints = [models.UniqueConstraint(fields=["module", "number"], name="learning_version_number")]


def _media_path(instance, filename):
    return f"learning/media/{instance.program_id}/{uuid.uuid4().hex}{os.path.splitext(filename)[1].lower()}"


class MediaAsset(BaseModel):
    """An image uploaded for lessons. Private: served only to signed-in people of the programme."""

    program = models.ForeignKey("identity.Program", on_delete=models.PROTECT, related_name="learning_media")
    file = models.FileField(upload_to=_media_path, storage=private_media_storage)
    content_type = models.CharField(max_length=64)
    alt = models.CharField(max_length=200)
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "learning_media_asset"


class Certificate(BaseModel):
    """A certificate of completion. Names and titles are copied so it stays true if either changes."""

    user = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="certificates")
    module = models.ForeignKey(TrainingModule, on_delete=models.PROTECT, related_name="certificates")
    version = models.PositiveIntegerField(default=1)
    number = models.CharField(max_length=24, unique=True)
    learner_name = models.CharField(max_length=200)
    module_title = models.CharField(max_length=200)
    score = models.PositiveSmallIntegerField()
    completed_at = models.DateTimeField()
    issued_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "learning_certificate"
        constraints = [models.UniqueConstraint(fields=["user", "module", "version"], name="learning_one_certificate_per_version")]


class BankQuestion(BaseModel):
    """A reusable question. Inserting it into a module copies it, so published versions never change."""

    program = models.ForeignKey("identity.Program", on_delete=models.PROTECT, related_name="question_bank")
    created_by = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="+")
    kind = models.CharField(max_length=12, default="single")
    scenario = models.TextField(blank=True, default="")
    prompt = models.CharField(max_length=1000)
    explanation = models.TextField(blank=True, default="")
    options = models.JSONField(default=list)  # [{"text": ..., "feedback": ...}]
    correct = models.JSONField(default=list)  # texts of the correct options
    tags = models.JSONField(default=list)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "learning_bank_question"
        ordering = ["-created_at"]
