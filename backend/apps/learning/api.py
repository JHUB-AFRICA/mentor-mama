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
    return TrainingModule.objects.filter(program_id=user.program_id, is_published=True).filter(
        visible_roles__contains=[user.role]
    ).prefetch_related("lessons", "quiz__questions").order_by("title")
