"""The domain error catalogue (Stage 3 §12).

Error codes are part of the versioned API contract (ERR-02): the offline client
branches on them, so renaming one is a breaking change.
"""

from __future__ import annotations


class DomainError(Exception):
    """Base for every expected failure. Never raise a bare ValueError (ERR-01)."""

    code = "DomainError"
    status = 400
    retryable = False
    message = "The request could not be completed."

    def __init__(self, message: str | None = None, **details):
        self.message = message or self.message
        self.details = details
        super().__init__(f"{self.code}: {self.message}")

    def as_dict(self) -> dict:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "retryable": self.retryable,
                "details": self.details,
            }
        }


def _error(code: str, status: int, message: str, retryable: bool = False):
    return type(code, (DomainError,), {
        "code": code, "status": status, "message": message, "retryable": retryable,
    })


# -- placement lifecycle ---------------------------------------------------
PlacementRequiresStudent = _error("PlacementRequiresStudent", 422, "A placement must have a student.")
PlacementAlreadyActive = _error("PlacementAlreadyActive", 409, "This placement is already active.")
PlacementNotActive = _error("PlacementNotActive", 409, "This placement is not active.")
PlacementClosed = _error("PlacementClosed", 409, "This placement is closed.")
PlacementArchived = _error("PlacementArchived", 409, "This placement is read-only.")
InvalidTransition = _error("InvalidTransition", 409, "That change is not allowed from the current state.")
InductionIncomplete = _error("InductionIncomplete", 409, "The induction checklist is not complete.")
FinalAssessmentMissing = _error("FinalAssessmentMissing", 409, "The final assessment has not been submitted.")
OpenEscalationBlocksCompletion = _error(
    "OpenEscalationBlocksCompletion", 409, "This placement cannot be completed while a concern is still open."
)

# -- assignment ------------------------------------------------------------
MentorAlreadyAssigned = _error("MentorAlreadyAssigned", 409, "This placement already has an active mentor.")
WardAlreadyAssigned = _error("WardAlreadyAssigned", 409, "This placement already has an active ward.")
StudentAlreadyAssigned = _error("StudentAlreadyAssigned", 409, "This student already has an overlapping placement.")
WardCapacityExceeded = _error("WardCapacityExceeded", 409, "This ward is at capacity.")
TrainingIncomplete = _error("TrainingIncomplete", 409, "The assigned mentor has not completed required training.")

# -- sessions --------------------------------------------------------------
DuplicateSession = _error("DuplicateSession", 200, "This session was already logged.")
SessionOutsidePlacementWindow = _error(
    "SessionOutsidePlacementWindow", 422, "That date is outside the placement period."
)
SessionValidationFailed = _error("SessionValidationFailed", 422, "Some required details are missing.")
SessionCorrectionWindowClosed = _error(
    "SessionCorrectionWindowClosed", 409, "This session can no longer be edited directly."
)

# -- assessment ------------------------------------------------------------
FeedbackImmutable = _error("FeedbackImmutable", 409, "Submitted feedback cannot be changed.")
AssessmentOutOfWindow = _error("AssessmentOutOfWindow", 409, "This cannot be submitted yet.")
ScoreOutOfRange = _error("ScoreOutOfRange", 422, "A score is outside the allowed range.")

# -- safeguarding ----------------------------------------------------------
InvalidEscalationTransition = _error("InvalidEscalationTransition", 409, "That change is not allowed.")
EscalationAccessDenied = _error("EscalationAccessDenied", 404, "Not found.")
ReviewerConflictOfInterest = _error(
    "ReviewerConflictOfInterest", 409, "The subject of a concern cannot review it."
)

# -- platform --------------------------------------------------------------
UnauthorizedFacilityAccess = _error("UnauthorizedFacilityAccess", 404, "Not found.")
ScopeDerivationMismatch = _error("ScopeDerivationMismatch", 500, "An internal consistency check failed.")
UnattributedWrite = _error("UnattributedWrite", 500, "An internal consistency check failed.")
OverrideReasonRequired = _error("OverrideReasonRequired", 422, "A reason is required.")
IdempotencyKeyRequired = _error("IdempotencyKeyRequired", 400, "Idempotency-Key header is required.")
IdempotencyKeyReused = _error("IdempotencyKeyReused", 409, "This request id was already used with different data.")
CommandInProgress = _error("CommandInProgress", 409, "This request is still being processed.", retryable=True)
StaleResource = _error("StaleResource", 409, "This record changed since you loaded it.")


#: Maps a database constraint/trigger name to the domain error it represents.
#: A constraint absent from this map fails a contract test rather than
#: surfacing to a user as a 500 (Stage 6 §6.2, DB-01).
CONSTRAINT_ERRORS: dict[str, type[DomainError]] = {
    "one_active_mentor_per_placement": MentorAlreadyAssigned,
    "one_active_ward_per_placement": WardAlreadyAssigned,
    "one_active_student_per_placement": StudentAlreadyAssigned,
    "student_no_overlapping_placements": StudentAlreadyAssigned,
    "pause_no_overlap": InvalidTransition,
    "one_open_pause_per_placement": InvalidTransition,
    "session_no_duplicate_within_window": DuplicateSession,
    "placements_no_write_when_terminal": PlacementArchived,
    "mentorship_session_window": PlacementNotActive,
    "assessments_immutable": FeedbackImmutable,
    "audit_no_mutation": UnattributedWrite,
    "audit_override_needs_reason": OverrideReasonRequired,
    "withdrawn_needs_reason": OverrideReasonRequired,
    "assessment_score_in_range": ScoreOutOfRange,
}


def translate_integrity_error(exc: Exception) -> DomainError | None:
    """Map a database constraint violation to its domain error (DB-01).

    Returns None when the constraint is unmapped, so the caller re-raises and
    the contract test catches the gap.
    """
    text = str(exc)
    for name, error in CONSTRAINT_ERRORS.items():
        if name in text:
            return error()
    return None
