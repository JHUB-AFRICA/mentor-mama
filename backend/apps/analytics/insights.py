"""Role-scoped reporting insights (concept note section 9 indicators).

One read model for the Reports screens of the Programme Admin, University
Coordinator and Nurse Manager. Scope always comes from the authenticated actor;
filters only narrow it further. Everything returned is an aggregate. Small
groups are suppressed (``MIN_GROUP``) so feedback and confidence figures cannot
be traced back to one student, and no free text or student names are included.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, timedelta

from django.db.models import Avg, Count
from django.db.models.functions import TruncWeek
from django.utils import timezone

from apps.assessments.models import FeedbackConfidential, Response
from apps.core.errors import UnauthorizedFacilityAccess
from apps.identity.models import Role, Status
from apps.identity.scope import resolve
from apps.induction.models import Checklist
from apps.learning.models import ModuleCompletion, TrainingModule
from apps.mentorship.models import Session, SessionTopic
from apps.placements import api as placement_api
from apps.placements.models import MentorAssignment, State, StudentAssignment
from apps.safeguarding.models import Escalation

MIN_GROUP = 3
#: A concern that is still unresolved after this many days is reported as overdue.
CONCERN_OVERDUE_DAYS = 7
REPORT_ROLES = {Role.PROGRAM_ADMIN, Role.COORDINATOR, Role.NURSE_MANAGER}

STATE_LABELS = {
    State.DRAFT: "Draft", State.SCHEDULED: "Scheduled", State.AWAITING_STUDENT: "Awaiting student",
    State.ORIENTATION: "Orientation", State.INDUCTION: "Induction", State.ACTIVE: "Active",
    State.PAUSED: "Paused", State.COMPLETED: "Completed", State.ARCHIVED: "Archived", State.WITHDRAWN: "Withdrawn",
}
FUNNEL_ORDER = [
    State.DRAFT, State.SCHEDULED, State.AWAITING_STUDENT, State.ORIENTATION, State.INDUCTION,
    State.ACTIVE, State.PAUSED, State.COMPLETED, State.WITHDRAWN,
]
POST_ORIENTATION = [State.ORIENTATION, State.INDUCTION, State.ACTIVE, State.PAUSED, State.COMPLETED]
QUESTION_LABELS = {
    "orientation": "Orientation to the unit",
    "mentor_availability": "Mentor availability",
    "constructive_feedback": "Constructive feedback",
    "confidence_this_week": "Confidence this week",
    "respectful_environment": "Respectful, supportive environment",
}


def _rate(numerator: int, denominator: int) -> dict:
    return {
        "numerator": numerator,
        "denominator": denominator,
        "rate": round(numerator * 100 / denominator, 1) if denominator else None,
    }


def _escalations(scope, actor):
    rows = Escalation.objects.all()
    if scope.role == Role.PROGRAM_ADMIN:
        return rows.filter(facility__program_id=scope.program_id)
    if scope.role == Role.COORDINATOR:
        return rows.filter(placement__institution_id=scope.institution_id)
    return rows.filter(facility_id=scope.facility_id)


def insights(*, actor, start: date, end: date, cohort_id=None, facility_id=None) -> dict:
    if actor.status != Status.ACTIVE or actor.role not in REPORT_ROLES:
        raise UnauthorizedFacilityAccess()
    scope = resolve(actor)
    scoped = placement_api.export_rows(scope)

    options = {
        "cohorts": [
            {"id": str(row["cohort_id"]), "name": row["cohort__name"]}
            for row in scoped.values("cohort_id", "cohort__name").distinct().order_by("cohort__name")
        ],
        "facilities": [
            {"id": str(row["facility_id"]), "name": row["facility__name"]}
            for row in scoped.exclude(facility_id=None).values("facility_id", "facility__name").distinct().order_by("facility__name")
        ],
    }
    placements = scoped
    if cohort_id:
        placements = placements.filter(cohort_id=cohort_id)
    if facility_id and scope.role != Role.NURSE_MANAGER:
        placements = placements.filter(facility_id=facility_id)
    placement_ids = list(placements.values_list("id", flat=True))

    days = (end - start).days + 1
    weeks = max(1, round(days / 7))
    prev_start, prev_end = start - timedelta(days=days), start - timedelta(days=1)

    # ---- placement funnel -------------------------------------------------
    by_state = Counter(placements.values_list("state", flat=True))
    funnel = [{"state": state, "label": STATE_LABELS[state], "count": by_state.get(state, 0)} for state in FUNNEL_ORDER]
    active_like = [State.ORIENTATION, State.INDUCTION, State.ACTIVE, State.PAUSED]
    student_ids = set(
        StudentAssignment.objects.filter(placement_id__in=placement_ids, ended_at=None).values_list("student_id", flat=True)
    )
    active_student_ids = set(
        StudentAssignment.objects.filter(
            placement_id__in=placement_ids, ended_at=None, placement__state__in=[State.ACTIVE, State.PAUSED]
        ).values_list("student_id", flat=True)
    )
    mentor_ids = set(
        MentorAssignment.objects.filter(placement_id__in=placement_ids, ended_at=None).values_list("mentor_id", flat=True)
    )

    # ---- induction --------------------------------------------------------
    eligible = placements.filter(state__in=POST_ORIENTATION)
    inducted = Checklist.objects.filter(placement__in=eligible, completed_at__isnull=False).count()
    induction = _rate(inducted, eligible.count())

    # ---- mentor training --------------------------------------------------
    required = list(TrainingModule.objects.filter(program_id=scope.program_id, is_required=True, is_published=True, archived_at=None))
    training_rate = _rate(0, len(mentor_ids))
    modules = []
    if mentor_ids:
        completions = Counter(
            ModuleCompletion.objects.filter(user_id__in=mentor_ids).values_list("module_id", flat=True)
        )
        done_by_user = Counter(
            ModuleCompletion.objects.filter(user_id__in=mentor_ids, module__in=required).values_list("user_id", flat=True)
        )
        if required:
            complete = sum(1 for mentor in mentor_ids if done_by_user.get(mentor, 0) >= len(required))
            training_rate = _rate(complete, len(mentor_ids))
        else:
            training_rate = {"numerator": 0, "denominator": len(mentor_ids), "rate": None}
        published = TrainingModule.objects.filter(program_id=scope.program_id, is_published=True, archived_at=None).order_by("title")
        modules = [
            {"title": module.title, "required": module.is_required, "completed": completions.get(module.id, 0), "total": len(mentor_ids)}
            for module in published
        ]

    # ---- sessions ---------------------------------------------------------
    sessions = Session.objects.filter(placement_id__in=placement_ids, session_date__gte=start, session_date__lte=end)
    sessions_total = sessions.count()
    previous_sessions = Session.objects.filter(placement_id__in=placement_ids, session_date__gte=prev_start, session_date__lte=prev_end).count()
    weekly = [
        {"week": row["week"].isoformat(), "sessions": row["total"]}
        for row in sessions.annotate(week=TruncWeek("session_date")).values("week").annotate(total=Count("id")).order_by("week")
    ]
    session_types = list(sessions.values("session_type").annotate(count=Count("id")).order_by("-count"))
    topics = list(
        SessionTopic.objects.filter(session__in=sessions).values("topic").annotate(count=Count("id")).order_by("-count")[:10]
    )
    students_with_sessions = sessions.values("placement__student_assignments__student_id").distinct().count()
    per_student_week = (
        round(sessions_total / (len(active_student_ids) * weeks), 2) if active_student_ids else None
    )

    # ---- concerns ---------------------------------------------------------
    concerns = _escalations(scope, actor)
    if cohort_id or facility_id:
        concerns = concerns.filter(placement_id__in=placement_ids)
    in_period = concerns.filter(created_at__date__gte=start, created_at__date__lte=end)
    open_states = ["open", "under_review", "action_required"]
    cutoff = timezone.now() - timedelta(days=CONCERN_OVERDUE_DAYS)
    open_concerns = concerns.filter(state__in=open_states)
    safeguarding = {
        "open": open_concerns.count(),
        "overdue": open_concerns.filter(created_at__lt=cutoff).count(),
        "raised_in_period": in_period.count(),
        "resolved_in_period": concerns.filter(state__in=["resolved", "closed"], updated_at__date__gte=start, updated_at__date__lte=end).count(),
        "overdue_after_days": CONCERN_OVERDUE_DAYS,
        "by_category": list(in_period.values("category").annotate(count=Count("id")).order_by("-count")),
        "by_state": list(concerns.values("state").annotate(count=Count("id")).order_by("state")),
        "by_severity": list(open_concerns.values("severity").annotate(count=Count("id")).order_by("severity")),
    }

    # ---- student feedback (aggregate, min-n) ------------------------------
    feedback_qs = FeedbackConfidential.objects.filter(
        placement_id__in=placement_ids, submitted_at__date__gte=start, submitted_at__date__lte=end
    )
    ratings = Response.objects.filter(
        feedback_confidential__in=feedback_qs, scale="likert_1_5", question_code__in=QUESTION_LABELS.keys()
    )
    feedback_questions = []
    for row in ratings.values("question_code").annotate(mean=Avg("value_numeric"), responses=Count("id")).order_by("question_code"):
        enough = row["responses"] >= MIN_GROUP
        feedback_questions.append({
            "code": row["question_code"], "label": QUESTION_LABELS[row["question_code"]],
            "responses": row["responses"], "mean": round(float(row["mean"]), 2) if enough else None,
        })
    scored = [item["mean"] for item in feedback_questions if item["mean"] is not None]
    overall = ratings.aggregate(mean=Avg("value_numeric"), responses=Count("id"))
    feedback = {
        "submissions": feedback_qs.count(),
        "overall_mean": round(float(overall["mean"]), 2) if overall["responses"] and feedback_qs.count() >= MIN_GROUP and scored else None,
        "questions": feedback_questions,
        "follow_ups_flagged": feedback_qs.filter(unresolved_concern=True).count(),
        "min_group": MIN_GROUP,
    }

    # ---- confidence change (baseline vs endline) --------------------------
    def _scores(code: str) -> dict:
        return {
            row["assessment__placement_id"]: float(row["value_numeric"])
            for row in Response.objects.filter(
                assessment__placement_id__in=placement_ids, question_code=code
            ).values("assessment__placement_id", "value_numeric")
        }

    baseline, endline = _scores("baseline_confidence"), _scores("endline_confidence")
    paired = [pid for pid in baseline if pid in endline]
    confidence = {"pairs": len(paired), "min_group": MIN_GROUP, "baseline_mean": None, "endline_mean": None, "change": None}
    if len(paired) >= MIN_GROUP:
        b = sum(baseline[p] for p in paired) / len(paired)
        e = sum(endline[p] for p in paired) / len(paired)
        confidence.update(baseline_mean=round(b, 1), endline_mean=round(e, 1), change=round(e - b, 1))

    # ---- breakdown (facility for programme-wide views, cohort for a facility) ---
    if scope.role == Role.NURSE_MANAGER:
        group_field, group_name, kind = "cohort_id", "cohort__name", "cohort"
    else:
        group_field, group_name, kind = "facility_id", "facility__name", "facility"
    breakdown = []
    for row in placements.exclude(**{group_field: None}).values(group_field, group_name).distinct().order_by(group_name):
        group_ids = list(placements.filter(**{group_field: row[group_field]}).values_list("id", flat=True))
        group_eligible = placements.filter(id__in=group_ids, state__in=POST_ORIENTATION)
        group_done = Checklist.objects.filter(placement__in=group_eligible, completed_at__isnull=False).count()
        group_sessions = sessions.filter(placement_id__in=group_ids).count()
        group_active = StudentAssignment.objects.filter(
            placement_id__in=group_ids, ended_at=None, placement__state__in=[State.ACTIVE, State.PAUSED]
        ).values("student_id").distinct().count()
        group_concerns = 0
        if kind == "facility":
            group_concerns = open_concerns.filter(facility_id=row[group_field]).count()
        else:
            group_concerns = open_concerns.filter(placement_id__in=group_ids).count()
        breakdown.append({
            "id": str(row[group_field]), "name": row[group_name],
            "placements": len(group_ids),
            "active_students": group_active,
            "induction_rate": _rate(group_done, group_eligible.count())["rate"],
            "sessions": group_sessions,
            "sessions_per_student_week": round(group_sessions / (group_active * weeks), 2) if group_active else None,
            "open_concerns": group_concerns,
        })

    return {
        "filters": {"from": start.isoformat(), "to": end.isoformat(), "cohort_id": str(cohort_id) if cohort_id else None, "facility_id": str(facility_id) if facility_id else None},
        "scope": {"role": scope.role, "breakdown_kind": kind},
        "options": options,
        "kpis": {
            "students": len(student_ids),
            "active_students": len(active_student_ids),
            "placements": len(placement_ids),
            "mentors": len(mentor_ids),
            "induction": induction,
            "training": training_rate,
            "sessions": sessions_total,
            "sessions_previous": previous_sessions,
            "sessions_per_student_week": per_student_week,
            "students_with_sessions": students_with_sessions,
            "open_concerns": safeguarding["open"],
            "overdue_concerns": safeguarding["overdue"],
            "feedback_score": feedback["overall_mean"],
            "confidence_change": confidence["change"],
            "in_progress": sum(by_state.get(state, 0) for state in active_like),
        },
        "funnel": funnel,
        "sessions_weekly": weekly,
        "session_types": [{"type": item["session_type"], "count": item["count"]} for item in session_types],
        "topics": [{"topic": item["topic"], "count": item["count"]} for item in topics],
        "training": {"mentors": len(mentor_ids), "required_modules": len(required), "modules": modules},
        "feedback": feedback,
        "confidence": confidence,
        "safeguarding": safeguarding,
        "breakdown": breakdown,
    }
