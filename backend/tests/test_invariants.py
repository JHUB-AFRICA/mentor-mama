"""One test per invariant, each attempting the violation and asserting refusal.

This module is what makes Stage 5 true rather than aspirational (T-01).
"""

from __future__ import annotations

import datetime as dt

import pytest
from django.db import IntegrityError, InternalError, transaction
from django.db.utils import ProgrammingError

from apps.core import errors
from apps.core.models import AuditEntry, OutboxEvent
from apps.mentorship import services as mentorship_services
from apps.mentorship.models import Session
from apps.placements import services as placement_services
from apps.placements.models import MentorAssignment, Placement, State, StudentAssignment

pytestmark = pytest.mark.django_db(transaction=True)

DB_REJECTED = (IntegrityError, InternalError, ProgrammingError)


# --- INV-01 / INV-12 -------------------------------------------------------
def test_inv12_two_open_mentor_assignments_are_refused(scheduled_placement, other_mentor, nurse_manager):
    """The partial unique index forbids concurrency, not history."""
    with pytest.raises(DB_REJECTED):
        with transaction.atomic():
            MentorAssignment.objects.create(
                placement=scheduled_placement, mentor=other_mentor, created_by=nurse_manager
            )


def test_inv12_reassignment_preserves_history(scheduled_placement, other_mentor, nurse_manager):
    placement_services.reassign_mentor(
        scheduled_placement.id, other_mentor.id, actor=nurse_manager, reason="staffing change"
    )
    assignments = MentorAssignment.objects.filter(placement=scheduled_placement)
    assert assignments.count() == 2, "the previous assignment must survive"
    assert assignments.filter(ended_at=None).count() == 1
    assert assignments.filter(ended_at=None).first().mentor_id == other_mentor.id


def test_inv01_two_open_student_assignments_are_refused(draft_placement, student, coordinator):
    with pytest.raises(DB_REJECTED):
        with transaction.atomic():
            StudentAssignment.objects.create(
                placement=draft_placement, student=student,
                started_on=dt.date(2026, 7, 1), created_by=coordinator,
            )


def test_student_cannot_hold_two_overlapping_placements(cohort, student, coordinator):
    """The EXCLUDE constraint — a range problem, not a uniqueness problem."""
    placement_services.create_placement(
        placement_services.CreatePlacement(
            cohort_id=cohort.id, student_id=student.id,
            planned_start=dt.date(2026, 7, 1), planned_end=dt.date(2026, 9, 1),
        ), actor=coordinator,
    )
    with pytest.raises(DB_REJECTED):
        placement_services.create_placement(
            placement_services.CreatePlacement(
                cohort_id=cohort.id, student_id=student.id,
                planned_start=dt.date(2026, 8, 1), planned_end=dt.date(2026, 10, 1),
            ), actor=coordinator,
        )


# --- INV-02 ----------------------------------------------------------------
def test_inv02_placement_cannot_activate_without_complete_induction(
    scheduled_placement, checklist_template, coordinator, student, mentor
):
    from apps.induction import services as induction_services
    from apps.induction.models import TemplateItem

    placement_services.transition(scheduled_placement.id, State.AWAITING_STUDENT, actor=coordinator)
    placement_services.transition(scheduled_placement.id, State.ORIENTATION, actor=student)
    checklist = induction_services.open_induction(scheduled_placement.id, actor=mentor)

    # answer only one of three required items
    first = TemplateItem.objects.filter(template=checklist.template).first()
    induction_services.answer_item(checklist.id, first.id, "yes", actor=mentor)

    with pytest.raises(errors.InductionIncomplete):
        induction_services.sign_induction(checklist.id, actor=mentor)

    scheduled_placement.refresh_from_db()
    assert scheduled_placement.state == State.INDUCTION, "must not have activated"


def test_tx03_signing_induction_activates_in_one_transaction(active_placement):
    """TX-03: the checklist completion and the activation commit together."""
    assert active_placement.state == State.ACTIVE
    assert active_placement.induction_checklist.completed_at is not None


# --- INV-04 / INV-05 -------------------------------------------------------
def test_inv05_session_refused_when_placement_not_active(scheduled_placement, mentor):
    with pytest.raises(errors.PlacementNotActive):
        mentorship_services.log_session(
            mentorship_services.LogSession(
                placement_id=scheduled_placement.id, session_date=dt.date(2026, 7, 10),
                session_type="bedside_teaching", topics=("labour_monitoring",),
            ), actor=mentor,
        )


def test_inv05_enforced_by_the_database_not_only_the_service(scheduled_placement, mentor):
    """The trigger is what protects a second write path (management command, psql)."""
    assignment = MentorAssignment.objects.filter(placement=scheduled_placement, ended_at=None).first()
    with pytest.raises(DB_REJECTED) as raised:
        with transaction.atomic():
            Session.objects.create(
                placement=scheduled_placement, mentor_assignment=assignment,
                session_date=dt.date(2026, 7, 10), session_type="bedside_teaching",
                created_by=mentor,
            )
    assert "mentorship_session_window" in str(raised.value)


def test_inv04_session_outside_the_window_is_refused(active_placement, mentor):
    with pytest.raises(errors.SessionOutsidePlacementWindow):
        mentorship_services.log_session(
            mentorship_services.LogSession(
                placement_id=active_placement.id, session_date=dt.date(2026, 10, 14),
                session_type="bedside_teaching", topics=("documentation",),
            ), actor=mentor,
        )


def test_inv04_session_inside_a_pause_is_refused(active_placement, mentor, nurse_manager):
    placement_services.pause(
        active_placement.id, actor=nurse_manager, reason="industrial_action",
        started_on=dt.date(2026, 7, 10),
    )
    placement_services.resume(active_placement.id, ended_on=dt.date(2026, 7, 20), actor=nurse_manager)

    with pytest.raises(errors.SessionOutsidePlacementWindow):
        mentorship_services.log_session(
            mentorship_services.LogSession(
                placement_id=active_placement.id, session_date=dt.date(2026, 7, 15),
                session_type="debrief", topics=("communication",),
            ), actor=mentor,
        )


def test_session_only_by_the_currently_assigned_mentor(active_placement, other_mentor):
    with pytest.raises(errors.UnauthorizedFacilityAccess):
        mentorship_services.log_session(
            mentorship_services.LogSession(
                placement_id=active_placement.id, session_date=dt.date(2026, 7, 10),
                session_type="debrief", topics=("communication",),
            ), actor=other_mentor,
        )


def test_wfr009_session_requires_at_least_one_topic(active_placement, mentor):
    with pytest.raises(errors.SessionValidationFailed):
        mentorship_services.log_session(
            mentorship_services.LogSession(
                placement_id=active_placement.id, session_date=dt.date(2026, 7, 10),
                session_type="debrief", topics=(),
            ), actor=mentor,
        )


def test_wfr014_duplicate_session_within_the_window_is_refused(active_placement, mentor):
    command = mentorship_services.LogSession(
        placement_id=active_placement.id, session_date=dt.date(2026, 7, 10),
        session_type="debrief", topics=("communication",),
    )
    mentorship_services.log_session(command, actor=mentor)
    with pytest.raises(errors.DuplicateSession):
        mentorship_services.log_session(command, actor=mentor)


def test_happy_path_session_is_logged_with_audit_and_event(active_placement, mentor):
    session = mentorship_services.log_session(
        mentorship_services.LogSession(
            placement_id=active_placement.id, session_date=dt.date(2026, 7, 10),
            session_type="bedside_teaching", topics=("labour_monitoring", "documentation"),
            duration_minutes=20,
        ), actor=mentor,
    )
    assert session.topics.count() == 2
    assert AuditEntry.objects.filter(action="session.log", entity_id=session.id).exists()
    assert OutboxEvent.objects.filter(event_type="SessionLogged").exists()


# --- INV-07 / INV-08 -------------------------------------------------------
def test_inv08_completion_blocked_without_final_assessment(active_placement, nurse_manager):
    with pytest.raises(errors.FinalAssessmentMissing):
        placement_services.transition(active_placement.id, State.COMPLETED, actor=nurse_manager)


def test_inv07_completion_blocked_by_an_open_escalation(active_placement, exit_survey, nurse_manager, student):
    from apps.safeguarding.models import Escalation

    Escalation.objects.create(
        placement=active_placement, facility_id=active_placement.facility_id,
        submitted_by=student, category="supervision", severity="high",
        description="restricted content",
    )
    with pytest.raises(errors.OpenEscalationBlocksCompletion) as raised:
        placement_services.transition(active_placement.id, State.COMPLETED, actor=nurse_manager)
    # counts and severity only — never content (POL-019, INV-13)
    assert raised.value.details == {"escalation_count": 1, "highest_severity": "high"}


def test_completion_succeeds_once_blockers_clear(active_placement, exit_survey, nurse_manager):
    placement = placement_services.transition(
        active_placement.id, State.COMPLETED, actor=nurse_manager
    )
    assert placement.state == State.COMPLETED
    assert placement.completed_at is not None


# --- INV-09 ----------------------------------------------------------------
def test_inv09_terminal_placements_are_immutable_at_the_database(
    active_placement, nurse_manager
):
    placement_services.transition(
        active_placement.id, State.WITHDRAWN, actor=nurse_manager, reason="student_withdrew"
    )
    with pytest.raises(DB_REJECTED) as raised:
        with transaction.atomic():
            Placement.objects.filter(id=active_placement.id).update(planned_end=dt.date(2027, 1, 1))
    assert "placements_no_write_when_terminal" in str(raised.value)


def test_withdrawal_requires_a_reason(active_placement, nurse_manager):
    with pytest.raises(errors.OverrideReasonRequired):
        placement_services.transition(active_placement.id, State.WITHDRAWN, actor=nurse_manager)


# --- INV-14 / INV-15 -------------------------------------------------------
def test_inv14_submitted_feedback_cannot_be_updated(active_placement):
    from apps.assessments.models import FeedbackConfidential

    feedback = FeedbackConfidential.objects.create(placement=active_placement, comments="original")
    with pytest.raises(DB_REJECTED) as raised:
        with transaction.atomic():
            FeedbackConfidential.objects.filter(id=feedback.id).update(comments="edited")
    assert "assessments_immutable" in str(raised.value)


def test_inv15_score_outside_its_range_is_refused(active_placement):
    from apps.assessments.models import Assessment, AssessmentKind, Response

    assessment = Assessment.objects.create(
        placement=active_placement, kind=AssessmentKind.BASELINE_CONFIDENCE
    )
    with pytest.raises(DB_REJECTED):
        with transaction.atomic():
            Response.objects.create(
                assessment=assessment, question_code="confidence",
                scale=Response.Scale.SCORE_0_100, value_numeric=105,
            )


# --- INV-16 ---------------------------------------------------------------
def test_inv16_ward_capacity_is_enforced(cohort, ward, coordinator, nurse_manager, program,
                                         institution, mentor, checklist_template):
    """max_students existed in the Concept Note and was enforced by nothing."""
    from apps.identity.models import Role, Status, User
    from apps.institutions.models import CohortMembership

    def place(n):
        person = User.objects.create_user(
            email=f"s{n}@students.jkuat.ac.ke", password="pw", first_name=f"S{n}", last_name="T",
            role=Role.STUDENT, status=Status.ACTIVE, program=program, institution_id=institution.id,
        )
        CohortMembership.objects.create(cohort=cohort, student=person)
        placement = placement_services.create_placement(
            placement_services.CreatePlacement(
                cohort_id=cohort.id, student_id=person.id,
                planned_start=dt.date(2026, 7, 1), planned_end=dt.date(2026, 9, 1),
            ), actor=coordinator,
        )
        placement_services.allocate_ward(placement.id, ward.id, actor=coordinator)
        placement_services.assign_mentor(placement.id, mentor.id, actor=nurse_manager)
        placement_services.transition(placement.id, State.AWAITING_STUDENT, actor=coordinator)
        placement_services.transition(placement.id, State.ORIENTATION, actor=coordinator)
        return placement

    place(1)
    place(2)                     # ward max_students == 2
    with pytest.raises(errors.WardCapacityExceeded):
        place(3)


# --- INV-11 / INV-17 / WFR-025 -------------------------------------------
def test_inv17_scope_columns_are_derived_not_supplied(draft_placement, cohort, ward, coordinator):
    assert draft_placement.institution_id == cohort.institution_id
    placement_services.allocate_ward(draft_placement.id, ward.id, actor=coordinator)
    draft_placement.refresh_from_db()
    assert draft_placement.facility_id == ward.facility_id


def test_inv11_every_command_records_an_attributed_audit_entry(draft_placement, coordinator):
    entry = AuditEntry.objects.filter(entity_id=draft_placement.id, action="placement.create").first()
    assert entry is not None
    assert entry.actor_id == coordinator.id
    assert entry.actor_role == "coordinator"


def test_audit_entries_cannot_be_altered(draft_placement):
    entry = AuditEntry.objects.first()
    with pytest.raises(DB_REJECTED) as raised:
        with transaction.atomic():
            AuditEntry.objects.filter(id=entry.id).update(action="tampered")
    assert "audit_no_mutation" in str(raised.value)


def test_wfr025_outbox_rejects_restricted_content(db):
    """Escalation content in a notification payload is the worst available mistake."""
    with pytest.raises(DB_REJECTED) as raised:
        with transaction.atomic():
            OutboxEvent.objects.create(
                event_type="EscalationRaised",
                payload={"escalation_id": "x", "description": "a patient name"},
            )
    assert "restricted content" in str(raised.value)


def test_pause_extends_actual_end_and_records_a_countable_reason(
    active_placement, nurse_manager
):
    """POL-020 and POL-021 — the JKUAT decisions of 30 July 2026."""
    original_end = active_placement.planned_end
    placement_services.pause(
        active_placement.id, actor=nurse_manager, reason="facility_closure",
        started_on=dt.date(2026, 7, 10),
    )
    placement = placement_services.resume(
        active_placement.id, ended_on=dt.date(2026, 7, 24), actor=nurse_manager
    )
    assert placement.actual_end == original_end + dt.timedelta(days=14)
    pause = placement.pauses.first()
    assert pause.reason == "facility_closure"      # countable, not free text
    assert pause.resumed_by_id == nurse_manager.id


def test_invalid_transition_is_refused(draft_placement, nurse_manager):
    with pytest.raises(errors.InvalidTransition):
        placement_services.transition(draft_placement.id, State.COMPLETED, actor=nurse_manager)
