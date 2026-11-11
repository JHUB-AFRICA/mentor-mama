"""Who has completed which training, and which questions people get wrong.

Scoped like the other report read models: programme admins see every active mentor in the programme;
coordinators and nurse managers see mentors assigned to placements in their institution or facility.
Learner names are shown here on purpose (managers need to follow up); no free text or scores per
question per person are returned, only aggregates for questions.
"""

from __future__ import annotations

from collections import Counter, defaultdict

from django.db.models import Avg, Max

from apps.core.errors import UnauthorizedFacilityAccess
from apps.identity.models import Role, Status, User
from apps.identity.scope import resolve
from apps.learning import versioning
from apps.learning.models import LessonProgress, ModuleCompletion, QuizAttempt, TrainingModule
from apps.placements import api as placement_api
from apps.placements.models import MentorAssignment

REPORT_ROLES = {Role.PROGRAM_ADMIN, Role.COORDINATOR, Role.NURSE_MANAGER}
MAX_ATTEMPTS_ANALYSED = 5000
MIN_ATTEMPTS = 3  # a question needs this many attempts before it is ranked as "hard"


def _mentors(actor, scope):
    if scope.role == Role.PROGRAM_ADMIN:
        return User.objects.filter(program_id=scope.program_id, role=Role.MENTOR, status=Status.ACTIVE)
    placement_ids = placement_api.export_rows(scope).values_list("id", flat=True)
    mentor_ids = MentorAssignment.objects.filter(placement_id__in=placement_ids, ended_at=None).values_list("mentor_id", flat=True)
    return User.objects.filter(id__in=mentor_ids, role=Role.MENTOR, status=Status.ACTIVE)


def training_report(*, actor) -> dict:
    if actor.status != Status.ACTIVE or actor.role not in REPORT_ROLES:
        raise UnauthorizedFacilityAccess()
    scope = resolve(actor)
    mentors = list(_mentors(actor, scope).order_by("last_name", "first_name"))
    mentor_ids = [m.id for m in mentors]
    modules = list(TrainingModule.objects.filter(program_id=scope.program_id, is_published=True, archived_at=None,
                                                 visible_roles__contains=[Role.MENTOR]).order_by("-is_required", "title"))
    required = [m for m in modules if m.is_required]
    completions = {(c.user_id, c.module_id): c for c in ModuleCompletion.objects.filter(user_id__in=mentor_ids, module__in=modules).select_related("module")}
    started = set(LessonProgress.objects.filter(user_id__in=mentor_ids, module__in=modules).values_list("user_id", "module_id"))
    started |= set(QuizAttempt.objects.filter(user_id__in=mentor_ids, module__in=modules).values_list("user_id", "module_id"))
    last_seen = dict(LessonProgress.objects.filter(user_id__in=mentor_ids).values("user_id").annotate(last=Max("created_at")).values_list("user_id", "last"))
    for user_id, last in ModuleCompletion.objects.filter(user_id__in=mentor_ids).values("user_id").annotate(last=Max("completed_at")).values_list("user_id", "last"):
        if user_id not in last_seen or last > last_seen[user_id]:
            last_seen[user_id] = last

    rows = []
    complete = 0
    for mentor in mentors:
        done = [m for m in required if (mentor.id, m.id) in completions and versioning.completion_counts(m, completions[(mentor.id, m.id)])]
        refresh = [m for m in required if (mentor.id, m.id) in completions and m not in done]
        touched = any((mentor.id, m.id) in started or (mentor.id, m.id) in completions for m in modules)
        if required and len(done) == len(required):
            state = "complete"
            complete += 1
        elif refresh:
            state = "needs_refresh"
        elif touched:
            state = "in_progress"
        else:
            state = "not_started"
        rows.append({"id": str(mentor.id), "name": mentor.full_name or mentor.email, "email": mentor.email,
                     "required_completed": len(done), "required_total": len(required), "state": state,
                     "last_activity": last_seen.get(mentor.id)})

    module_rows = []
    for module in modules:
        finished = [(u, m) for (u, m) in completions if m == module.id]
        average = ModuleCompletion.objects.filter(user_id__in=mentor_ids, module=module).aggregate(a=Avg("score"))["a"]
        in_progress = len({u for (u, m) in started if m == module.id} - {u for u, _ in finished})
        module_rows.append({"id": str(module.id), "title": module.title, "required": module.is_required,
                            "completed": len(finished), "in_progress": in_progress,
                            "not_started": max(0, len(mentors) - len(finished) - in_progress),
                            "average_score": round(average) if average is not None else None})

    return {
        "summary": {"mentors": len(mentors), "required_modules": len(required), "mentors_complete": complete,
                    "rate": round(complete * 100 / len(mentors), 1) if mentors and required else None},
        "mentors": rows,
        "modules": module_rows,
        "hard_questions": _hard_questions(modules, mentor_ids),
    }


def _hard_questions(modules, mentor_ids) -> list[dict]:
    """Questions answered wrongly most often, using the version each attempt was taken on."""
    snapshots = {}
    for module in modules:
        versions = list(module.versions.all())
        for version in versions:
            snapshots[(module.id, version.number)] = version.snapshot
        if not versions:  # never published through the version flow: learners saw the working copy as version 1
            snapshots[(module.id, 1)] = versioning.build_snapshot(module)
    asked, missed, prompts = Counter(), Counter(), {}
    attempts = QuizAttempt.objects.filter(user_id__in=mentor_ids, module__in=modules).exclude(answers={}).order_by("-created_at")[:MAX_ATTEMPTS_ANALYSED]
    titles = {m.id: m.title for m in modules}
    for attempt in attempts:
        snapshot = snapshots.get((attempt.module_id, attempt.version))
        if snapshot is None:
            continue
        for question in snapshot.get("quiz", []):
            given = attempt.answers.get(question["id"])
            if given is None:
                continue
            chosen = set(given) if isinstance(given, list) else {given}
            key = (attempt.module_id, question["id"])
            asked[key] += 1
            prompts[key] = question["prompt"]
            if chosen != versioning.correct_ids(question):
                missed[key] += 1
    ranked = defaultdict(list)
    for key, total in asked.items():
        if total >= MIN_ATTEMPTS and missed[key]:
            ranked[key[0]].append({"module": titles[key[0]], "prompt": prompts[key], "attempts": total,
                                   "wrong_rate": round(missed[key] * 100 / total)})
    flat = [row for rows in ranked.values() for row in rows]
    return sorted(flat, key=lambda row: (-row["wrong_rate"], -row["attempts"]))[:10]
