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
OrientationIncomplete = _error("OrientationIncomplete", 409, "The student orientation has not been completed.")
FinalAssessmentMissing = _error("FinalAssessmentMissing", 409, "The final assessment has not been submitted.")
OpenEscalationBlocksCompletion = _error(
    "OpenEscalationBlocksCompletion", 409, "This placement cannot be completed while a concern is still open."
)

# -- assignment ------------------------------------------------------------
MentorAlreadyAssigned = _error("MentorAlreadyAssigned", 409, "This placement already has an active mentor.")
WardAlreadyAssigned = _error("WardAlreadyAssigned", 409, "This placement already has an active ward.")
StudentAlreadyAssigned = _error("StudentAlreadyAssigned", 409, "This student already has an overlapping placement.")
CohortOverlap = _error("CohortOverlap", 409, "This student already belongs to a cohort with overlapping dates.")
InvalidCohortDates = _error("InvalidCohortDates", 400, "The cohort end date must be after its start date.")
WardCapacityExceeded = _error("WardCapacityExceeded", 409, "This ward is at capacity.")
WardCapacityBelowOccupancy = _error(
    "WardCapacityBelowOccupancy", 409,
    "Ward capacity cannot be lower than the number of occupying placements assigned to it.",
)
DirectoryImportInvalid = _error("DirectoryImportInvalid", 422, "The directory CSV contains invalid rows.")
DirectoryImportPreviewStale = _error("DirectoryImportPreviewStale", 409, "The file or directory changed after preview. Review a fresh preview.")
DirectoryImportWarningsUnconfirmed = _error("DirectoryImportWarningsUnconfirmed", 409, "Review and acknowledge import warnings before continuing.")
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
AssessmentNotReady = _error(
    "AssessmentNotReady", 409,
    "Your final assessment is available after your placement becomes active and its end date has passed.",
)
ScoreOutOfRange = _error("ScoreOutOfRange", 422, "A score is outside the allowed range.")
AcknowledgementNameMismatch = _error(
    "AcknowledgementNameMismatch", 422,
    "Enter your full name as it appears on your account to acknowledge this placement.",
)
AcknowledgementAlreadySigned = _error(
    "AcknowledgementAlreadySigned", 409,
    "This placement has already been acknowledged. Open the assignment to view the saved record.",
)
AssessmentAlreadySubmitted = _error("AssessmentAlreadySubmitted", 409, "This final assessment has already been submitted.")
FeedbackUnavailable = _error("FeedbackUnavailable", 409, "Feedback is not available for this placement yet.")
AnonymousFeedbackUnavailable = _error(
    "AnonymousFeedbackUnavailable", 409,
    "Use the dedicated anonymous feedback endpoint so submission metadata is not linked to your placement.",
)
EmailMFAUnavailable = _error("EmailMFAUnavailable", 409, "Email verification is not available for this account.")
EmailMFAThrottled = _error("EmailMFAThrottled", 429, "Please wait before requesting another email code.", retryable=True)
InvitationResendThrottled = _error("InvitationResendThrottled", 429, "This invitation has reached its resend limit. Contact programme support for help.", retryable=True)
InvalidEmailMFA = _error("InvalidEmailMFA", 400, "The email verification code is invalid or expired.")

# -- safeguarding ----------------------------------------------------------
InvalidEscalationTransition = _error("InvalidEscalationTransition", 409, "That change is not allowed.")
EscalationAccessDenied = _error("EscalationAccessDenied", 404, "Not found.")
ReviewerConflictOfInterest = _error(
    "ReviewerConflictOfInterest", 409, "The subject of a concern cannot review it."
)

# -- platform --------------------------------------------------------------
UnauthorizedFacilityAccess = _error("UnauthorizedFacilityAccess", 404, "Not found.")
ExportExpired = _error("export_expired", 410, "This export has expired. Request it again.")
TooManyExports = _error("too_many_exports", 429, "You already have 3 exports being prepared. Wait for one to finish.", retryable=True)
ExportFileUnavailable = _error("ExportFileUnavailable", 410, "This export file is no longer available. Request a fresh snapshot to download it.")
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
