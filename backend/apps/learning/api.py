"""Public learning queries used by placement guards and the API."""


from apps.learning import versioning
from apps.learning.text import plain_text
from apps.learning.models import ModuleCompletion, TrainingModule


def _assigned(user):
    """Live modules meant for this user's role (archived or other-audience modules never count)."""
    return TrainingModule.objects.filter(
        program_id=user.program_id, is_published=True, archived_at=None, visible_roles__contains=[user.role]
    )


def _counted_completions(user, modules) -> set:
    """Module ids this person has completed in a way that still counts (decision D-3 grace period)."""
    rows = ModuleCompletion.objects.filter(user=user, module__in=modules).select_related("module")
    return {row.module_id for row in rows if versioning.completion_counts(row.module, row)}


def required_modules_complete(user) -> bool:
    required = list(_assigned(user).filter(is_required=True))
    counted = _counted_completions(user, required)
    return all(module.id in counted for module in required)


def progress(user) -> dict:
    modules = list(_assigned(user))
    counted = _counted_completions(user, modules)
    required = [m for m in modules if m.is_required]
    required_done = sum(1 for m in required if m.id in counted)
    completed = len(counted)
    return {"available": bool(modules), "completed": completed, "total": len(modules),
            "percentage": round(completed * 100 / len(modules)) if modules else None,
            "required_completed": required_done, "required_total": len(required),
            "required_complete": required_done == len(required)}


def visible_modules(user):
    return TrainingModule.objects.filter(program_id=user.program_id, is_published=True, archived_at=None).filter(
        visible_roles__contains=[user.role]
    ).prefetch_related("lessons", "quiz__questions").order_by("title")


def _documents(modules) -> list[dict]:
    """Lessons of the version learners currently see (not unpublished edits)."""
    rows = []
    for module in modules:
        latest = versioning.latest_version(module)
        lessons = latest.snapshot["lessons"] if latest else versioning.build_snapshot(module)["lessons"]
        rows.extend({"kind": "Training", "title": f"{module.title}: {lesson['title']}", "text": plain_text(lesson["body"])} for lesson in lessons)
    return rows


def knowledge_documents(user) -> list[dict]:
    """Published lessons this user may read, as plain dicts for grounded assistants."""
    return _documents(visible_modules(user))


def catalogue(user, limit: int = 25) -> list[dict]:
    """Titles of published modules this user may open, with their own completion state."""
    done = set(ModuleCompletion.objects.filter(user=user).values_list("module_id", flat=True))
    return [
        {"title": module.title, "required": module.is_required, "completed": module.id in done,
         "lessons": module.lessons.count(), "description": (module.description or "")[:160]}
        for module in visible_modules(user)[:limit]
    ]


def programme_catalogue(user, limit: int = 40) -> list[dict]:
    """Every module in the user's programme with audience and status (for content managers)."""
    rows = TrainingModule.objects.filter(program_id=user.program_id).prefetch_related("lessons").order_by("title")[:limit]
    return [
        {"title": module.title, "required": module.is_required, "published": module.is_published,
         "audience": list(module.visible_roles), "lessons": module.lessons.count(),
         "description": (module.description or "")[:160]}
        for module in rows
    ]


def programme_knowledge_documents(user) -> list[dict]:
    """Lessons of every published module in the programme (content managers may read all of them)."""
    return _documents(TrainingModule.objects.filter(program_id=user.program_id, is_published=True))

