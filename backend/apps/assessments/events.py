from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class FinalAssessmentSubmitted:
    placement_id: UUID
    assessment_id: UUID
    recipient_user_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class FeedbackSubmitted:
    mode: str
    feedback_id: UUID
    placement_id: UUID | None = None
    recipient_user_ids: tuple[UUID, ...] = ()
