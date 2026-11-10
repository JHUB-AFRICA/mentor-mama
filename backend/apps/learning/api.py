"""Public learning queries used by placement guards and the API."""


from apps.learning.models import ModuleCompletion, TrainingModule


def required_modules_complete(user) -> bool:
    required = TrainingModule.objects.filter(program_id=user.program_id, is_required=True, is_published=True)
    return not required.exclude(completions__user_id=user.id).exists()


def progress(user) -> dict:
    modules = TrainingModule.objects.filter(program_id=user.program_id, is_published=True)
    completed = ModuleCompletion.objects.filter(user=user, module__in=modules).count()
    required = modules.filter(is_required=True).count()
    required_done = ModuleCompletion.objects.filter(user=user, module__is_required=True, module__in=modules).count()
    return {"available": modules.exists(), "completed": completed, "total": modules.count(),
            "percentage": round(completed * 100 / modules.count()) if modules.exists() else None,
            "required_completed": required_done, "required_total": required,
            "required_complete": required_done == required}


def visible_modules(user):
    return TrainingModule.objects.filter(program_id=user.program_id, is_published=True, archived_at=None).filter(
        visible_roles__contains=[user.role]
    ).prefetch_related("lessons", "quiz__questions").order_by("title")


def knowledge_documents(user) -> list[dict]:
    """Published lessons this user may read, as plain dicts for grounded assistants."""
    return [
        {"kind": "Training", "title": f"{module.title}: {lesson.title}", "text": lesson.body}
        for module in visible_modules(user)
        for lesson in module.lessons.all()
    ]


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
    modules = TrainingModule.objects.filter(program_id=user.program_id, is_published=True).prefetch_related("lessons")
    return [
        {"kind": "Training", "title": f"{module.title}: {lesson.title}", "text": lesson.body}
        for module in modules
        for lesson in module.lessons.all()
    ]

