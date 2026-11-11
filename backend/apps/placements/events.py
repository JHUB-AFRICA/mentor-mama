"""Domain events published by placements (Stage 3.5 Appendix B).

Payloads carry identifiers only — never restricted content (EV-01, WFR-025).
"""

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class PlacementCreated:
    placement_id: UUID
    cohort_id: UUID


@dataclass(frozen=True)
class WardAllocated:
    placement_id: UUID
    ward_id: UUID


@dataclass(frozen=True)
class PlacementScheduled:
    placement_id: UUID
    recipient_user_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class PlacementInvitationIssued:
    placement_id: UUID
    student_id: UUID


@dataclass(frozen=True)
class PlacementAcknowledgementReminderRequested:
    placement_id: UUID
    student_id: UUID


@dataclass(frozen=True)
class MentorAssigned:
    placement_id: UUID
    mentor_id: UUID
    recipient_user_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class MentorReassigned:
    placement_id: UUID
    mentor_id: UUID
    previous_mentor_id: UUID
    recipient_user_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class PlacementActivated:
    placement_id: UUID


@dataclass(frozen=True)
class PlacementPaused:
    placement_id: UUID
    reason: str
    recipient_user_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class PlacementResumed:
    placement_id: UUID
    recipient_user_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class PlacementCompleted:
    placement_id: UUID
    recipient_user_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class PlacementWithdrawn:
    placement_id: UUID
    reason: str
    recipient_user_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class PlacementsArranged:
    """Batch summary for coordinators after a facility arranges incoming students."""

    facility_id: UUID
    arranged: int
    unplaced: int
    recipient_user_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class MentorPlacementsAssigned:
    """One message to a mentor who received several students in one arrangement."""

    mentor_id: UUID
    count: int
    recipient_user_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class PlacementsRequested:
    """A coordinator asked a facility to host students (the facility's incoming queue)."""

    facility_id: UUID
    count: int
    recipient_user_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class ArrangementOverridden:
    """A coordinator changed a facility's ward or mentor arrangement."""

    placement_id: UUID
    what: str
    recipient_user_ids: tuple[UUID, ...] = ()
