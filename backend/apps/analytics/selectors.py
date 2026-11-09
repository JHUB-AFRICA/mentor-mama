"""Role-scoped dashboard read models.

The general dashboard indicators remain computed on read for the pilot. The
interruption report is served from an analytics-owned materialized projection.
"""

from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Count, Sum

from apps.analytics.models import AnonymousFeedbackAggregate, CohortIndicator, FacilityIndicator, FeedbackAggregate, InterruptionCause
from apps.identity.models import Role, Status
from apps.identity.scope import resolve
from apps.assessments import api as assessments
from apps.induction import api as induction
from apps.mentorship import api as mentorship
from apps.placements import api as placement_api
from apps.safeguarding import api as safeguarding
from apps.learning import api as learning
from apps.core.models import AuditEntry
from apps.mentorship.models import Session


def dashboard(*, actor) -> dict:
    if actor.status != Status.ACTIVE:
        return {"role": actor.role, "indicators": {}}
    scope = resolve(actor)
    result = placement_api.dashboard_counts(scope)
    result.update(safeguarding.dashboard_counts(actor))
    result.update(mentorship.dashboard_counts(actor))
    # Programme Admin reporting must reconcile to the live placement register.
    # The operational materialized views refresh every five minutes and can
    # briefly disagree with the full lifecycle counts calculated above.
    if actor.role != Role.PROGRAM_ADMIN:
        result.update(_operational_projection_counts(actor))
    if actor.role == Role.PROGRAM_ADMIN:
        result["people_total"] = actor.program.users.exclude(id=actor.id).count()
    return {"role": actor.role, "indicators": result}


def report_overview(*, actor, period_start: date, period_end: date) -> dict:
    """Return an accurate scoped snapshot plus event-based period analytics."""
    if actor.status != Status.ACTIVE:
        return {"period": {"start": period_start.isoformat(), "end": period_end.isoformat()}, "summary": {}, "trend": []}
    scope = resolve(actor)
    live = dashboard(actor=actor)["indicators"]
    length = (period_end - period_start).days + 1
    previous_start = period_start - timedelta(days=length)
    previous_end = period_start - timedelta(days=1)
    placement_rows = placement_api.export_rows(scope)
    period_placements = placement_rows.filter(created_at__date__gte=period_start, created_at__date__lte=period_end)
    previous_placements = placement_rows.filter(created_at__date__gte=previous_start, created_at__date__lte=previous_end)
    completed = placement_rows.filter(completed_at__date__gte=period_start, completed_at__date__lte=period_end).count()
    previous_completed = placement_rows.filter(completed_at__date__gte=previous_start, completed_at__date__lte=previous_end).count()
    sessions = Session.objects.filter(placement__in=placement_rows, session_date__gte=period_start, session_date__lte=period_end)
    previous_sessions = Session.objects.filter(placement__in=placement_rows, session_date__gte=previous_start, session_date__lte=previous_end)
    activity = AuditEntry.objects.filter(scope__program_id=str(scope.program_id), occurred_at__date__gte=period_start, occurred_at__date__lte=period_end)
    previous_activity = AuditEntry.objects.filter(scope__program_id=str(scope.program_id), occurred_at__date__gte=previous_start, occurred_at__date__lte=previous_end)
    current = {"placements_created": period_placements.count(), "placements_completed": completed, "sessions_logged": sessions.count(), "activity_events": activity.count()}
    previous = {"placements_created": previous_placements.count(), "placements_completed": previous_completed, "sessions_logged": previous_sessions.count(), "activity_events": previous_activity.count()}
    trend = []
    day = period_start
    while day <= period_end:
        trend.append({
            "date": day.isoformat(),
            "placements_created": period_placements.filter(created_at__date=day).count(),
            "placements_completed": placement_rows.filter(completed_at__date=day).count(),
            "sessions_logged": sessions.filter(session_date=day).count(),
            "activity_events": activity.filter(occurred_at__date=day).count(),
        })
        day += timedelta(days=1)
    return {"period": {"start": period_start.isoformat(), "end": period_end.isoformat()}, "previous_period": {"start": previous_start.isoformat(), "end": previous_end.isoformat()}, "summary": {**live, **current}, "comparisons": {key: _percentage_change(current[key], previous[key]) for key in current}, "trend": trend}


def _percentage_change(current: int, previous: int) -> float | None:
    if previous == 0:
        return None if current == 0 else None
    return round(((current - previous) / previous) * 100, 1)


def _operational_projection_counts(actor) -> dict[str, int]:
    """Read staff dashboard placement/session counts from disposable projections."""
    if actor.role == Role.PROGRAM_ADMIN:
        rows = FacilityIndicator.objects.filter(program_id=actor.program_id)
    elif actor.role == Role.COORDINATOR:
        rows = CohortIndicator.objects.filter(program_id=actor.program_id, institution_id=actor.institution_id)
    elif actor.role == Role.NURSE_MANAGER:
        rows = FacilityIndicator.objects.filter(program_id=actor.program_id, facility_id=actor.facility_id)
    else:
        return {}
    if not rows.exists():
        # The projection is disposable and may not have been refreshed yet.
        # Preserve the live counts calculated by dashboard() rather than
        # presenting an empty projection as a real zero.
        return {}
    totals = rows.aggregate(
        total=Sum("placements_total"), active=Sum("placements_active"),
        awaiting_student=Sum("placements_awaiting_student"), induction=Sum("placements_induction"),
        completed=Sum("placements_completed"), sessions=Sum("sessions_total"),
    )
    return {
        "placements_total": totals["total"] or 0,
        "placements_active": totals["active"] or 0,
        "placements_awaiting_student": totals["awaiting_student"] or 0,
        "placements_induction": totals["induction"] or 0,
        "placements_completed": totals["completed"] or 0,
        "sessions_total": totals["sessions"] or 0,
    }


def interruptions(*, actor) -> list[dict]:
    if actor.status != Status.ACTIVE:
        return []
    scope = resolve(actor)
    rows = InterruptionCause.objects.filter(program_id=scope.program_id)
    if scope.role == Role.COORDINATOR:
        rows = rows.filter(institution_id=scope.institution_id)
    elif scope.role == Role.NURSE_MANAGER:
        rows = rows.filter(facility_id=scope.facility_id)
    elif scope.role != Role.PROGRAM_ADMIN:
        return []
    return list(rows.order_by("-days_interrupted", "facility_name", "cohort_name", "reason").values(
        "facility_id", "facility_name", "cohort_id", "cohort_name", "reason", "interruptions", "days_interrupted",
    ))


def feedback(*, actor) -> list[dict]:
    """Return mentor feedback figures only after the projection's min-n gate."""
    if actor.status != Status.ACTIVE or actor.role != Role.MENTOR:
        return []
    return list(FeedbackAggregate.objects.filter(
        mentor_id=actor.id, responses__gte=3, mean_score__isnull=False,
    ).order_by("question_code").values("question_code", "responses", "mean_score"))


def anonymous_feedback_report(*, actor) -> list[dict]:
    """Return only cohort/facility/ward aggregates backed by at least three submissions."""
    if actor.status != Status.ACTIVE or actor.role not in {Role.COORDINATOR, Role.NURSE_MANAGER}:
        return []
    rows = AnonymousFeedbackAggregate.objects.filter(program_id=actor.program_id, submissions__gte=3)
    if actor.role == Role.COORDINATOR:
        rows = rows.filter(institution_id=actor.institution_id)
    else:
        rows = rows.filter(facility_id=actor.facility_id)
    rows = rows.order_by("cohort_name", "facility_name", "ward_name", "metric_kind", "question_code", "scale")
    grouped = {}
    for row in rows:
        key = (row.cohort_id, row.facility_id, row.ward_id)
        group = grouped.setdefault(key, {
            "cohort_id": str(row.cohort_id), "cohort_name": row.cohort_name,
            "facility_id": str(row.facility_id), "facility_name": row.facility_name,
            "ward_id": str(row.ward_id), "ward_name": row.ward_name,
            "submissions": 0, "scores": [],
        })
        if row.metric_kind == "submissions":
            group["submissions"] = row.submissions
        elif row.metric_kind == "question" and row.submissions >= 3:
            group["scores"].append({
                "question_code": row.question_code,
                "scale": row.scale,
                "responses": row.responses,
                "mean_score": float(row.mean_score) if row.mean_score is not None else None,
            })
    return list(grouped.values())


def placement_progress(*, actor, placement_id) -> dict:
    """Compose the placement progress value object on read (WFR-022)."""
    if actor.status != Status.ACTIVE:
        return {}
    placement = placement_api.assert_access(placement_id, actor=actor)
    induction_data = induction.progress(placement.id)
    assessment_data = assessments.progress(placement.id)
    mentorship_data = mentorship.progress(placement.id)
    training_data = learning.progress(actor) if actor.role == "mentor" else {"available": False, "percentage": None}
    available = []
    if induction_data["percentage"] is not None:
        available.append(induction_data["percentage"])
    available.extend([
        100 if assessment_data["final_submitted"] else 0,
    ])
    return {
        "placement_id": str(placement.id),
        "state": placement.state,
        "training": training_data,
        "induction": induction_data,
        "mentorship": mentorship_data,
        "assessment": assessment_data,
        "orientation": {"acknowledged": induction.orientation_acknowledged(placement.id)},
        "safeguarding": {"open_concerns": safeguarding.open_count(placement.id), "severity": safeguarding.open_severity_counts(placement.id)},
        "overall_percentage": round(sum(available) / len(available)) if available else None,
    }


def cohort_progress(*, actor, cohort_id) -> dict:
    """Summarize placement pipeline counts within an authorized cohort."""
    from apps.institutions.models import Cohort
    from apps.placements.models import Placement
    if actor.status != Status.ACTIVE or actor.role not in {Role.COORDINATOR, Role.PROGRAM_ADMIN}:
        return {}
    cohorts = Cohort.objects.filter(id=cohort_id, archived_at=None)
    if actor.role == Role.COORDINATOR:
        cohorts = cohorts.filter(institution_id=actor.institution_id)
    else:
        cohorts = cohorts.filter(institution__program_id=actor.program_id)
    cohort = cohorts.first()
    if cohort is None:
        return {}
    placements = Placement.objects.filter(cohort=cohort, archived_at__isnull=True)
    states = dict(placements.values_list("state").annotate(total=Count("id")))
    placed_student_ids = placements.exclude(state__in=["completed", "withdrawn", "archived"]).values(
        "student_assignments__student_id"
    )
    return {
        "cohort_id": str(cohort.id),
        "placement_count": sum(states.values()),
        "by_state": states,
        "students_without_placement": cohort.memberships.filter(removed_at=None).exclude(student_id__in=placed_student_ids).count(),
    }
