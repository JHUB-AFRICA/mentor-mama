"""Assessment commands owned by the assessments module.

Final assessment submission is one immutable command containing the exit survey
and endline confidence rating. Placement owns access and lifecycle state; this
module owns assessment timing, shape, and persistence.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import hmac
import json
from uuid import UUID

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from apps.assessments import events
from apps.assessments.events import FeedbackSubmitted
from apps.assessments.models import (
    AnonymousFeedbackAuditDay, AnonymousFeedbackCommand, AnonymousResponse, Assessment, AssessmentKind,
    FeedbackAnonymous, FeedbackConfidential, Response,
)
from apps.core import audit, errors, outbox
from apps.identity import api as identity
from apps.placements import api as placements
from apps.placements.models import State
from apps.identity.models import Role


@dataclass(frozen=True)
class FinalAssessment:
    placement_id: UUID
    confidence_score: int
    overall_experience: int


@dataclass(frozen=True)
class SubmitFeedback:
    placement_id: UUID
    mode: str
    comments: str | None = None
    responses: tuple[dict, ...] = ()


@transaction.atomic
def submit_feedback(cmd: SubmitFeedback, *, actor):
    """Persist immutable student voice with explicit anonymity routing."""
    identity.require_capability(actor, "submit_feedback")
    authority = placements.verify_assessment_write(cmd.placement_id, actor=actor)
    placement = placements.assert_access(cmd.placement_id, actor=actor)
    if placement.state not in {"orientation", "induction", "active", "paused"}:
        raise errors.PlacementNotActive(state=placement.state)
    if cmd.mode == "anonymous":
        raise errors.AnonymousFeedbackUnavailable("Use the anonymous feedback command so identity metadata is not persisted.")
    feedback = FeedbackConfidential.objects.create(
        placement_id=authority.placement_id, comments=cmd.comments,
    )
    for response in cmd.responses:
        Response.objects.create(feedback_confidential=feedback, **response)
    audit.record(actor=actor, action="feedback.confidential_submit", entity_table="assessments_feedback_confidential",
                 entity_id=feedback.id, changes={"mode": "confidential"})
    recipients = list(identity.users(
        role=identity.ROLES.COORDINATOR, status=identity.STATUSES.ACTIVE,
        institution_id=placement.institution_id,
    ).values_list("id", flat=True))
    outbox.publish(FeedbackSubmitted(
        mode="confidential", feedback_id=feedback.id, placement_id=placement.id,
        recipient_user_ids=tuple(recipients),
    ))
    return feedback


def _anonymous_digest(purpose: bytes, value: bytes) -> str:
    secret = settings.SECRET_KEY.encode("utf-8")
    return hmac.new(secret, purpose + b":" + value, hashlib.sha256).hexdigest()


@transaction.atomic
def submit_anonymous_feedback(cmd: SubmitFeedback, *, actor, command_id: UUID):
    """Submit anonymous voice without writing an actor-to-feedback reference."""
    identity.require_capability(actor, "submit_feedback")
    authority = placements.verify_assessment_write(cmd.placement_id, actor=actor)
    placement = placements.assert_access(cmd.placement_id, actor=actor)
    if placement.state not in {"orientation", "induction", "active", "paused"}:
        raise errors.PlacementNotActive(state=placement.state)
    ward_assignment = placement.ward_assignments.filter(ended_at=None).select_related("ward").first()
    if placement.facility_id is None or ward_assignment is None:
        raise errors.InvalidTransition("Anonymous feedback needs the assigned facility and ward context.")

    payload = json.dumps({
        "placement_id": str(authority.placement_id),
        "responses": list(cmd.responses),
    }, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    command_digest = _anonymous_digest(b"anonymous-feedback-command", command_id.bytes)
    payload_digest = _anonymous_digest(b"anonymous-feedback-payload", payload)
    try:
        with transaction.atomic():
            AnonymousFeedbackCommand.objects.create(
                command_digest=command_digest,
                payload_digest=payload_digest,
                received_on=timezone.localdate(),
            )
    except IntegrityError:
        prior = AnonymousFeedbackCommand.objects.filter(command_digest=command_digest).first()
        if prior is None or (prior.payload_digest and not hmac.compare_digest(prior.payload_digest, payload_digest)):
            raise errors.IdempotencyKeyReused()
        return None, True

    feedback = FeedbackAnonymous.objects.create(
        cohort_id=placement.cohort_id,
        facility_id=placement.facility_id,
        ward_id=ward_assignment.ward_id,
        submitted_on=timezone.localdate(),
    )
    for response in cmd.responses:
        AnonymousResponse.objects.create(feedback_anonymous=feedback, **response)

    # The event log records only a coarse daily system total, not actor, scope,
    # feedback id, or a timestamp that could be joined back to one response.
    AnonymousFeedbackAuditDay.objects.bulk_create(
        [AnonymousFeedbackAuditDay(submitted_on=feedback.submitted_on)], ignore_conflicts=True,
    )
    AnonymousFeedbackAuditDay.objects.filter(submitted_on=feedback.submitted_on).update(
        submissions=F("submissions") + 1,
    )
    return feedback, False


def final_status(placement_id: UUID, *, actor) -> dict:
    authority = placements.verify_assessment_write(placement_id, actor=actor)
    submitted = Assessment.objects.filter(
        placement_id=placement_id, kind=AssessmentKind.EXIT_SURVEY
    ).exists()
    lifecycle_allows_closeout = authority.state in {State.ACTIVE, State.PAUSED}
    is_due = timezone.localdate() >= authority.effective_end
    return {
        "submitted": submitted,
        "can_submit": not submitted and lifecycle_allows_closeout and is_due,
        "effective_end": authority.effective_end.isoformat(),
    }


def submit_final(cmd: FinalAssessment, *, actor) -> Assessment:
    identity.require_capability(actor, "submit_assessment")
    with transaction.atomic():
        authority = placements.verify_assessment_write(cmd.placement_id, actor=actor)
        if authority.state not in {State.ACTIVE, State.PAUSED}:
            raise errors.AssessmentNotReady()
        if timezone.localdate() < authority.effective_end:
            raise errors.AssessmentOutOfWindow()
        if Assessment.objects.filter(
            placement_id=authority.placement_id, kind=AssessmentKind.EXIT_SURVEY
        ).exists():
            raise errors.AssessmentAlreadySubmitted()
        if not 0 <= cmd.confidence_score <= 100:
            raise errors.ScoreOutOfRange()
        if not 1 <= cmd.overall_experience <= 5:
            raise errors.ScoreOutOfRange()

        confidence = Assessment.objects.create(
            placement_id=authority.placement_id, kind=AssessmentKind.FINAL_CONFIDENCE
        )
        Response.objects.create(
            assessment=confidence,
            question_code="endline_confidence",
            scale=Response.Scale.SCORE_0_100,
            value_numeric=cmd.confidence_score,
        )
        exit_survey = Assessment.objects.create(
            placement_id=authority.placement_id, kind=AssessmentKind.EXIT_SURVEY
        )
        Response.objects.create(
            assessment=exit_survey,
            question_code="overall_experience",
            scale=Response.Scale.LIKERT_1_5,
            value_numeric=cmd.overall_experience,
        )
        audit.record(
            actor=actor,
            action="assessment.final_submit",
            entity_table="assessments_assessment",
            entity_id=exit_survey.id,
            changes={"placement_id": str(authority.placement_id)},
        )
        placement = placements.assert_access(authority.placement_id, actor=actor)
        recipients = list(identity.users(
            role=identity.ROLES.NURSE_MANAGER, status=identity.STATUSES.ACTIVE,
            facility_id=placement.facility_id,
        ).values_list("id", flat=True))
        outbox.publish(events.FinalAssessmentSubmitted(
            placement_id=authority.placement_id, assessment_id=exit_survey.id,
            recipient_user_ids=tuple(recipients),
        ))
    return exit_survey


def approved_feedback(*, actor) -> list[dict]:
    """Return the approved confidential-feedback surface for operational reviewers.

    The reviewer receives placement context and the student's identity because
    this is the explicitly approved coordinator/manager workflow. Mentorship
    free text, assessment responses, and safeguarding narrative remain outside
    this contract.
    """
    identity.require_capability(actor, "review_feedback")
    rows = FeedbackConfidential.objects.filter(
        placement__institution__program_id=actor.program_id,
    ).select_related(
        "placement__cohort", "placement__institution", "placement__facility",
    ).prefetch_related("placement__student_assignments", "placement__ward_assignments__ward")
    if actor.role == Role.COORDINATOR:
        rows = rows.filter(placement__institution_id=actor.institution_id)
    elif actor.role == Role.NURSE_MANAGER:
        rows = rows.filter(placement__facility_id=actor.facility_id)
    else:
        raise errors.UnauthorizedFacilityAccess()

    result = []
    for row in rows.order_by("-submitted_at")[:100]:
        placement = row.placement
        student_assignment = next(
            (item for item in placement.student_assignments.all() if item.ended_at is None),
            None,
        )
        ward_assignment = next(
            (item for item in placement.ward_assignments.all() if item.ended_at is None),
            None,
        )
        result.append({
            "id": str(row.id),
            "placement_id": str(placement.id),
            "student_name": student_assignment.student.full_name if student_assignment else "Assigned student",
            "cohort_name": placement.cohort.name,
            "institution_name": placement.institution.name,
            "facility_name": placement.facility.name if placement.facility else "Unassigned facility",
            "ward_name": ward_assignment.ward.name if ward_assignment else "Unassigned ward",
            "comments": row.comments or "",
            "unresolved_concern": row.unresolved_concern,
            "submitted_at": row.submitted_at.isoformat(),
        })
        audit.record(
            actor=actor,
            action="feedback.confidential_read",
            entity_table="assessments_feedback_confidential",
            entity_id=row.id,
            scope={"program_id": str(actor.program_id)},
            changes={"placement_id": str(placement.id)},
        )
    return result
