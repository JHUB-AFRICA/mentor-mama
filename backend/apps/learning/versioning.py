"""Immutable module versions: snapshots, publishing, and which version a learner is on."""

import hashlib
import json
from datetime import timedelta

from django.db import transaction
from django.db.models import Min
from django.utils import timezone

from apps.core.errors import InvalidTransition
from apps.learning.models import LessonProgress, ModuleCompletion, ModuleVersion

MAJOR_GRACE_DAYS = 30  # decision D-3: an older completion still counts this long after a major change


def question_snapshot(q) -> dict:
    """Optional fields are written only when used, so versions published earlier keep their hash."""
    row = {"id": str(q.id), "position": q.position, "prompt": q.prompt, "options": q.options,
           "option_ids": q.option_ids, "correct_option_id": q.correct_option_id}
    if q.kind != "single":
        row["kind"] = q.kind
    if q.kind == "multi":
        row["correct_option_ids"] = q.correct_option_ids
    if q.scenario:
        row["scenario"] = q.scenario
    if q.explanation:
        row["explanation"] = q.explanation
    if any(q.option_feedback):
        row["option_feedback"] = q.option_feedback
    if q.lesson_key:
        row["lesson_id"] = str(q.lesson_key)
    return row


def correct_ids(question: dict) -> set:
    return set(question.get("correct_option_ids") or [question["correct_option_id"]])


def build_snapshot(module) -> dict:
    """The learner-visible content of the editable working copy, with stable lesson/question/option ids."""
    lessons = [
        {"id": str(row.id), "position": row.position, "title": row.title, "body": row.body,
         "lesson_type": row.lesson_type, "duration_minutes": row.duration_minutes, "video_url": row.video_url,
         "section": row.section}
        for row in module.lessons.order_by("position")
    ]
    quiz = []
    if hasattr(module, "quiz"):
        quiz = [question_snapshot(q) for q in module.quiz.questions.order_by("position")]
    return {"title": module.title, "description": module.description, "pass_mark": module.pass_mark,
            "lessons": lessons, "quiz": quiz}


def hash_snapshot(snapshot: dict) -> str:
    # Fields added after a version was published are ignored while empty, so old versions keep matching.
    snapshot = {**snapshot, "lessons": [{k: v for k, v in lesson.items() if not (k == "section" and not v)} for lesson in snapshot["lessons"]]}
    return hashlib.sha256(json.dumps(snapshot, sort_keys=True, default=str).encode()).hexdigest()


def latest_version(module):
    return module.versions.order_by("-number").first()


def has_unpublished_changes(module) -> bool:
    latest = latest_version(module)
    return latest is None or latest.content_hash != hash_snapshot(build_snapshot(module))


@transaction.atomic
def publish(*, module, user, change_kind="major", change_note=""):
    """Make the working copy live. Creates a new immutable version when the content changed."""
    if not module.lessons.exists():
        raise InvalidTransition("Add at least one lesson before publishing.")
    if change_kind not in ModuleVersion.ChangeKind.values:
        raise InvalidTransition("Choose whether this is a minor or a major change.")
    snapshot = build_snapshot(module)
    digest = hash_snapshot(snapshot)
    latest = latest_version(module)
    if latest is not None and latest.content_hash == digest:
        version = latest  # nothing changed: just (re)publish the existing version
    else:
        if latest is not None and change_kind == "major" and not change_note.strip():
            raise InvalidTransition("Say what changed so learners and reviewers can see why.")
        version = ModuleVersion.objects.create(
            module=module, number=(latest.number + 1) if latest else 1,
            change_kind="major" if latest is None else change_kind, change_note=change_note.strip()[:500],
            published_by=user, snapshot=snapshot, content_hash=digest,
        )
    module.is_published = True
    module.archived_at = None
    module.save(update_fields=["is_published", "archived_at", "updated_at"])
    return version


def pinned_version(module, user):
    """People finish the version they started; everyone else gets the latest."""
    latest = latest_version(module)
    if latest is None:
        return None
    if ModuleCompletion.objects.filter(module=module, user=user).exists():
        return latest
    started = LessonProgress.objects.filter(module=module, user=user).aggregate(low=Min("version"))["low"]
    if started:
        pinned = module.versions.filter(number=started).first()
        if pinned is None:
            return latest
        # Nobody stays on an old version forever: once a newer major version is past its grace
        # period (decision D-3) the learner moves to the latest one.
        stale_major = module.versions.filter(
            change_kind="major", number__gt=pinned.number,
            published_at__lt=timezone.now() - timedelta(days=MAJOR_GRACE_DAYS)).exists()
        return latest if stale_major else pinned
    return latest


def completion_counts(module, completion) -> bool:
    """Does this completion still satisfy the placement requirement? (decision D-3)"""
    latest_major = module.versions.filter(change_kind="major").order_by("-number").first()
    if latest_major is None or completion.version >= latest_major.number:
        return True
    return timezone.now() < latest_major.published_at + timedelta(days=MAJOR_GRACE_DAYS)


def content_for(module, user):
    """(snapshot, version number) this person should see. Falls back to the working copy for
    modules that have never been published through the version flow."""
    version = pinned_version(module, user)
    if version is not None:
        return version.snapshot, version.number
    return build_snapshot(module), 1


def answer_to_option_id(question: dict, answer):
    ids, texts = question["option_ids"], question["options"]
    if answer in ids:
        return answer
    if answer in texts:
        return ids[texts.index(answer)]
    return None


def grade(question: dict, answer):
    """Resolve one submitted answer to a set of option ids and say whether it is fully right (all-or-nothing, D-5)."""
    raw = answer if isinstance(answer, list) else [answer]
    if question.get("kind") != "multi" and len(raw) != 1:
        return set(), False
    chosen = {answer_to_option_id(question, item) for item in raw}
    if None in chosen:
        return chosen - {None}, False
    return chosen, chosen == correct_ids(question)
