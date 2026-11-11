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
from apps.assessments import services as assessment_services
from apps.assessments.models import Assessment, AssessmentKind, Response
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
    placement_services.transition(
        scheduled_placement.id, State.ORIENTATION, actor=student,
        asserted_by="student.confirm_placement",
    )
    induction_services.acknowledge_orientation(
        scheduled_placement.id, actor=student,
        understands_placement_details=True, understands_emergency_process=True,
        understands_safeguarding=True,
    )
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
                what_was_covered="Handover practice",
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
                what_was_covered="Documentation review",
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
                what_was_covered="Communication practice",
            ), actor=mentor,
        )


def test_session_only_by_the_currently_assigned_mentor(active_placement, other_mentor):
    with pytest.raises(errors.UnauthorizedFacilityAccess):
        mentorship_services.log_session(
            mentorship_services.LogSession(
                placement_id=active_placement.id, session_date=dt.date(2026, 7, 10),
                session_type="debrief", topics=("communication",),
                what_was_covered="Communication practice",
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
        session_type="debrief", topics=("communication",), what_was_covered="Communication practice",
    )
    mentorship_services.log_session(command, actor=mentor)
    with pytest.raises(errors.DuplicateSession):
        mentorship_services.log_session(command, actor=mentor)


def test_happy_path_session_is_logged_with_audit_and_event(active_placement, mentor):
    session = mentorship_services.log_session(
        mentorship_services.LogSession(
            placement_id=active_placement.id, session_date=dt.date(2026, 7, 10),
            session_type="bedside_teaching", topics=("labour_monitoring", "documentation"),
            duration_minutes=20, what_was_covered="Handover and documentation practice",
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


def test_programme_admin_can_archive_completed_placement(active_placement, exit_survey, nurse_manager, program):
    from apps.identity.models import Role, Status, User

    admin = User.objects.create_user(
        email="archive-admin@example.test", password="pw", first_name="Archive",
        last_name="Admin", role=Role.PROGRAM_ADMIN, status=Status.ACTIVE, program=program,
    )
    placement_services.transition(active_placement.id, State.COMPLETED, actor=nurse_manager)
    archived = placement_services.transition(
        active_placement.id,
        State.ARCHIVED,
        actor=admin,
        asserted_by="programme_admin.archive_placement",
    )
    assert archived.state == State.ARCHIVED
    assert archived.archived_at is not None


def test_final_assessment_submission_creates_immutable_exit_and_endline_records(
    active_placement, student, monkeypatch
):
    monkeypatch.setattr(
        assessment_services.timezone, "localdate", lambda: dt.date(2026, 9, 2)
    )
    submitted = assessment_services.submit_final(
        assessment_services.FinalAssessment(
            placement_id=active_placement.id,
            confidence_score=82,
            overall_experience=5,
        ),
        actor=student,
    )
    assert submitted.kind == AssessmentKind.EXIT_SURVEY
    assert Assessment.objects.filter(
        placement=active_placement, kind=AssessmentKind.FINAL_CONFIDENCE
    ).count() == 1
    assert Response.objects.filter(
        assessment__placement=active_placement, question_code="endline_confidence",
        value_numeric=82,
    ).exists()
    assert assessment_services.final_status(active_placement.id, actor=student)["submitted"] is True


def test_final_assessment_is_blocked_before_effective_end(active_placement, student, monkeypatch):
    from apps.assessments import services as assessment_services

    monkeypatch.setattr(
        assessment_services.timezone, "localdate", lambda: dt.date(2026, 8, 31)
    )
    with pytest.raises(errors.AssessmentOutOfWindow):
        assessment_services.submit_final(
            assessment_services.FinalAssessment(
                placement_id=active_placement.id, confidence_score=70, overall_experience=4
            ),
            actor=student,
        )


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
        placement_services.allocate_ward(placement.id, ward.id, actor=nurse_manager)
        placement_services.assign_mentor(placement.id, mentor.id, actor=nurse_manager)
        placement_services.transition(placement.id, State.AWAITING_STUDENT, actor=coordinator)
        placement_services.transition(
            placement.id, State.ORIENTATION, actor=person,
            asserted_by="student.confirm_placement",
        )
        return placement

    place(1)
    place(2)                     # ward max_students == 2
    with pytest.raises(errors.WardCapacityExceeded):
        place(3)


# --- INV-11 / INV-17 / WFR-025 -------------------------------------------
def test_inv17_scope_columns_are_derived_not_supplied(draft_placement, cohort, ward, nurse_manager):
    assert draft_placement.institution_id == cohort.institution_id
    placement_services.allocate_ward(draft_placement.id, ward.id, actor=nurse_manager)
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
    # These fixtures use a historical planned window. The service preserves the
    # invariant that actual_end cannot precede the actual activation date.
    assert placement.actual_end == max(
        original_end + dt.timedelta(days=14), active_placement.actual_start
    )
    pause = placement.pauses.first()
    assert pause.reason == "facility_closure"      # countable, not free text
    assert pause.resumed_by_id == nurse_manager.id


def test_invalid_transition_is_refused(scheduled_placement, nurse_manager):
    with pytest.raises(errors.InvalidTransition):
        placement_services.transition(scheduled_placement.id, State.COMPLETED, actor=nurse_manager)


def test_completed_placement_is_closed_to_mentor_and_ward_changes(active_placement, exit_survey, other_mentor, nurse_manager, ward):
    import pytest
    from apps.core import errors
    from apps.placements import services as placement_services
    from apps.placements.models import State

    placement_services.transition(active_placement.id, State.COMPLETED, actor=nurse_manager)
    with pytest.raises(errors.PlacementClosed):
        placement_services.reassign_mentor(active_placement.id, other_mentor.id, actor=nurse_manager, reason="late change")
    with pytest.raises(errors.PlacementClosed):
        placement_services.assign_mentor(active_placement.id, other_mentor.id, actor=nurse_manager)
    with pytest.raises(errors.PlacementClosed):
        placement_services.allocate_ward(active_placement.id, ward.id, actor=nurse_manager)


def test_default_induction_template_is_seeded_once_and_never_overwrites(program):
    from apps.induction.models import ChecklistTemplate
    from apps.induction.services import DEFAULT_CHECKLIST_ITEMS, ensure_default_template

    template, created = ensure_default_template(program)
    assert created is True
    assert template.items.count() == len(DEFAULT_CHECKLIST_ITEMS) == 8
    again, created_again = ensure_default_template(program)
    assert created_again is False and again.id == template.id
    assert ChecklistTemplate.objects.filter(program=program).count() == 1


def test_report_insights_are_scoped_aggregate_and_suppress_small_groups(active_placement, coordinator, nurse_manager, mentor, student):
    from rest_framework.test import APIClient

    from apps.assessments.models import FeedbackConfidential, Response

    feedback = FeedbackConfidential.objects.create(placement=active_placement, comments="private text")
    Response.objects.create(feedback_confidential=feedback, question_code="orientation", scale="likert_1_5", value_numeric=4)

    coordinator_client = APIClient()
    coordinator_client.force_authenticate(coordinator)
    response = coordinator_client.get("/api/v1/reports/insights")
    assert response.status_code == 200, response.content
    data = response.json()["data"]
    assert data["scope"]["breakdown_kind"] == "facility"
    assert data["kpis"]["placements"] == 1
    assert data["kpis"]["mentors"] == 1
    assert data["kpis"]["induction"]["denominator"] == 1
    # One response is below the minimum group size, so no score is revealed.
    assert data["feedback"]["overall_mean"] is None
    assert all(item["mean"] is None for item in data["feedback"]["questions"])
    assert "private text" not in response.content.decode()

    manager_client = APIClient()
    manager_client.force_authenticate(nurse_manager)
    assert manager_client.get("/api/v1/reports/insights").json()["data"]["scope"]["breakdown_kind"] == "cohort"

    for outsider in (mentor, student):
        client = APIClient()
        client.force_authenticate(outsider)
        assert client.get("/api/v1/reports/insights").status_code == 404


def _requested_drafts(program, institution, cohort, coordinator, facility, count):
    """Create enrolled students with draft placements already requested of `facility`."""
    import datetime as dt

    from apps.identity.models import Role, Status, User
    from apps.institutions.models import CohortMembership
    from apps.placements import services as svc
    from apps.placements.models import Placement

    ids = []
    for index in range(count):
        student = User.objects.create_user(
            email=f"auto-{index}@students.jkuat.ac.ke", password="pw", first_name=f"Auto{index}", last_name="Student",
            role=Role.STUDENT, status=Status.ACTIVE, program=program, institution_id=institution.id,
        )
        CohortMembership.objects.create(cohort=cohort, student=student)
        placement = svc.create_placement(
            svc.CreatePlacement(cohort_id=cohort.id, student_id=student.id, planned_start=dt.date(2026, 9, 1), planned_end=dt.date(2026, 11, 1)),
            actor=coordinator,
        )
        ids.append(placement.id)
    Placement.objects.filter(id__in=ids).update(requested_facility=facility)
    return ids


def test_nurse_manager_sees_incoming_and_auto_arranges_within_ward_and_mentor_capacity(program, institution, cohort, coordinator, nurse_manager, facility, ward, mentor, other_mentor):
    from rest_framework.test import APIClient

    from apps.notifications.models import Notification  # noqa: F401
    from apps.core.models import OutboxEvent
    from apps.placements.models import MentorAssignment, Placement, State, WardAssignment

    ids = _requested_drafts(program, institution, cohort, coordinator, facility, 3)  # ward holds 2
    manager = APIClient()
    manager.force_authenticate(nurse_manager)

    incoming = manager.get("/api/v1/placements/incoming")
    assert incoming.status_code == 200 and len(incoming.json()["data"]) == 3

    preview = manager.post("/api/v1/placements/auto-arrange", {"preview": True, "seed": "abc12345"}, format="json")
    assert preview.status_code == 200, preview.content
    plan = preview.json()["data"]
    assert plan["summary"]["arranged"] == 2 and plan["summary"]["unplaced"] == 1
    assert Placement.objects.filter(id__in=ids, state=State.DRAFT, facility=None).count() == 3  # preview changes nothing

    import uuid

    applied = manager.post("/api/v1/placements/auto-arrange", {"seed": "abc12345"}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert applied.status_code == 201, applied.content
    result = applied.json()["data"]
    assert result["summary"]["arranged"] == 2
    assert WardAssignment.objects.filter(placement_id__in=ids, ended_at=None).count() == 2
    assert MentorAssignment.objects.filter(placement_id__in=ids, ended_at=None).count() == 2
    # Ward + mentor complete => system-derived scheduling, one summary email instead of one per student.
    assert Placement.objects.filter(id__in=ids, state=State.SCHEDULED).count() == 2
    types = list(OutboxEvent.objects.values_list("event_type", flat=True))
    assert "MentorPlacementsAssigned" in types and "PlacementsArranged" in types
    assert "PlacementScheduled" not in types[-6:] or types.count("PlacementScheduled") == 0


def test_only_the_requested_facility_sees_and_arranges_a_request(program, institution, cohort, coordinator, nurse_manager, facility):
    from rest_framework.test import APIClient

    from apps.facilities.models import Facility

    other = Facility.objects.create(program=program, name="Other Hospital")
    ids = _requested_drafts(program, institution, cohort, coordinator, other, 1)
    manager = APIClient()
    manager.force_authenticate(nurse_manager)
    assert manager.get("/api/v1/placements/incoming").json()["data"] == []
    assert manager.get(f"/api/v1/placements/{ids[0]}").status_code == 404
    student_client = APIClient()
    coord = APIClient()
    coord.force_authenticate(coordinator)
    assert coord.post("/api/v1/placements/auto-arrange", {"preview": True}, format="json").status_code == 404
    del student_client


def test_coordinator_splits_a_batch_across_facilities_by_declared_capacity(program, institution, cohort, coordinator, facility, ward):
    from rest_framework.test import APIClient

    from apps.facilities.models import Facility, Ward
    from apps.placements.models import Placement

    big = Facility.objects.create(program=program, name="Big Hospital")
    Ward.objects.create(facility=big, name="Big Ward", max_students=6)
    ids = _requested_drafts(program, institution, cohort, coordinator, facility, 4)
    Placement.objects.filter(id__in=ids).update(requested_facility=None)
    client = APIClient()
    client.force_authenticate(coordinator)
    body = {"placement_ids": [str(i) for i in ids], "facility_ids": [str(facility.id), str(big.id)], "mode": "capacity", "seed": "seed1234"}
    preview = client.post("/api/v1/placements/facility-requests", {**body, "preview": True}, format="json")
    assert preview.status_code == 200, preview.content
    by_facility = {row["facility_id"]: row["requested"] for row in preview.json()["data"]["facilities"]}
    assert by_facility[str(big.id)] > by_facility[str(facility.id)]  # 6 free vs 2 free
    assert sum(by_facility.values()) == 4

    import uuid

    applied = client.post("/api/v1/placements/facility-requests", body, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert applied.status_code == 201, applied.content
    assert Placement.objects.filter(id__in=ids, requested_facility__isnull=False).count() == 4


def test_ward_can_be_changed_within_the_facility_without_a_second_open_assignment(draft_placement, ward, facility, nurse_manager):
    from apps.facilities.models import Ward
    from apps.placements import services
    from apps.placements.models import WardAssignment

    other = Ward.objects.create(facility=facility, name="Second Ward", max_students=2)
    services.allocate_ward(draft_placement.id, ward.id, actor=nurse_manager)
    services.allocate_ward(draft_placement.id, other.id, actor=nurse_manager)
    open_rows = WardAssignment.objects.filter(placement=draft_placement, ended_at=None)
    assert [row.ward_id for row in open_rows] == [other.id]
    assert WardAssignment.objects.filter(placement=draft_placement).count() == 2
    services.allocate_ward(draft_placement.id, other.id, actor=nurse_manager)  # same ward: no-op
    assert WardAssignment.objects.filter(placement=draft_placement).count() == 2


def test_finished_placements_do_not_count_against_mentor_capacity(active_placement, mentor, nurse_manager):
    from apps.identity import api as identity
    from apps.placements.models import Placement

    assert identity.active_mentors(program_id=mentor.program_id).get(id=mentor.id).active_placement_count == 1
    from django.utils import timezone
    Placement.objects.filter(id=active_placement.id).update(state="completed", completed_at=timezone.now())
    assert identity.active_mentors(program_id=mentor.program_id).get(id=mentor.id).active_placement_count == 0


def test_failing_outbox_events_back_off_then_stop_blocking_the_queue(monkeypatch):
    from django.core.management import call_command

    from apps.core.models import OutboxEvent

    bad = OutboxEvent.objects.create(event_type="PlacementPaused", payload={})
    good = OutboxEvent.objects.create(event_type="PlacementResumed", payload={})
    calls = []

    def fake_deliver(event):
        calls.append(event.event_type)
        if event.event_type == "PlacementPaused":
            raise RuntimeError("provider down")

    monkeypatch.setattr("apps.notifications.management.commands.dispatch_outbox.deliver_outbox_event", fake_deliver)
    call_command("dispatch_outbox")
    bad.refresh_from_db()
    good.refresh_from_db()
    assert good.dispatched_at is not None  # a failing event does not hold up later ones
    assert bad.attempts == 1 and bad.next_attempt_at is not None and bad.dead_at is None
    call_command("dispatch_outbox")  # backed off: not retried immediately
    assert calls.count("PlacementPaused") == 1
    OutboxEvent.objects.filter(id=bad.id).update(attempts=7, next_attempt_at=None)
    call_command("dispatch_outbox")
    bad.refresh_from_db()
    assert bad.dead_at is not None  # given up after the cap


def test_safety_and_security_emails_ignore_notification_opt_outs(student):
    from apps.notifications.email import _optional_email_enabled
    from apps.notifications.models import NotificationPreference

    NotificationPreference.objects.create(user_id=student.id, account_activity=False, programme_updates=False, placement_updates=False)
    for mandatory in ("EscalationRaised", "EscalationStatusChanged", "PasswordResetRequested", "SecurityNotificationRequested"):
        assert _optional_email_enabled(user_id=student.id, event_type=mandatory) is True
    assert _optional_email_enabled(user_id=student.id, event_type="PlacementPaused") is False


def test_auto_arrange_applies_only_the_reviewed_plan_and_keeps_a_replayable_run(program, institution, cohort, coordinator, nurse_manager, facility, ward, mentor):
    import uuid

    from rest_framework.test import APIClient

    from apps.placements.models import AllocationRun

    ids = _requested_drafts(program, institution, cohort, coordinator, facility, 2)
    manager = APIClient()
    manager.force_authenticate(nurse_manager)
    body = {"seed": "seed1234", "strategy": "balanced", "assign_mentors": True}
    plan = manager.post("/api/v1/placements/auto-arrange", {**body, "preview": True}, format="json").json()["data"]
    assert len(plan["plan_hash"]) == 64 and plan["summary"]["arranged"] == 2

    stale = manager.post("/api/v1/placements/auto-arrange", {**body, "expected_plan_hash": "0" * 64}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert stale.status_code in {400, 409, 422}
    assert not AllocationRun.objects.exists()  # nothing happened, nothing recorded

    key = str(uuid.uuid4())
    applied = manager.post("/api/v1/placements/auto-arrange", {**body, "expected_plan_hash": plan["plan_hash"]}, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert applied.status_code == 201, applied.content
    run = AllocationRun.objects.get()
    assert run.status in {"completed", "partial"} and run.plan_hash == plan["plan_hash"]
    assert run.result["summary"]["arranged"] == applied.json()["data"]["summary"]["arranged"]

    replay = manager.post("/api/v1/placements/auto-arrange", {**body, "expected_plan_hash": plan["plan_hash"]}, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert replay.json()["data"]["run_id"] == str(run.id)  # the real outcome, not an empty acknowledgement
    del ids


def test_an_arrangement_can_be_undone_once_and_students_return_to_the_incoming_queue(program, institution, cohort, coordinator, nurse_manager, facility, ward, mentor):
    import uuid

    from rest_framework.test import APIClient

    from apps.placements.models import Placement, WardAssignment

    ids = _requested_drafts(program, institution, cohort, coordinator, facility, 2)
    manager = APIClient()
    manager.force_authenticate(nurse_manager)
    applied = manager.post("/api/v1/placements/auto-arrange", {"seed": "seed1234"}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).json()["data"]
    assert applied["summary"]["arranged"] == 2
    runs = manager.get("/api/v1/placements/allocation-runs").json()["data"]
    assert runs[0]["can_undo"] is True and runs[0]["arranged"] == 2

    undone = manager.post(f"/api/v1/placements/allocation-runs/{applied['run_id']}/undo", {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert undone.status_code == 200 and undone.json()["data"]["reverted"] == 2
    assert not WardAssignment.objects.filter(placement_id__in=ids, ended_at=None).exists()
    assert set(Placement.objects.filter(id__in=ids).values_list("state", "facility_id")) == {("draft", None)}
    assert len(manager.get("/api/v1/placements/incoming").json()["data"]) == 2  # back in the queue
    again = manager.post(f"/api/v1/placements/allocation-runs/{applied['run_id']}/undo", {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert again.status_code in {400, 409, 422}  # cannot be undone twice


def test_sharing_notifies_each_student_once_and_again_only_when_details_change(draft_placement, ward, facility, mentor, coordinator, nurse_manager, student):
    import datetime as dt

    from apps.core.models import OutboxEvent
    from apps.facilities.models import Ward
    from apps.placements import notices, services

    services.allocate_ward(draft_placement.id, ward.id, actor=nurse_manager)
    first = notices.share_with_students(actor=coordinator)
    assert first["sent"] == 1 and first["updated"] == 0
    again = notices.share_with_students(actor=coordinator)
    assert again["sent"] == 0 and again["unchanged"] == 1  # nothing changed: no second email
    other = Ward.objects.create(facility=facility, name="Moved Ward", max_students=2)
    services.allocate_ward(draft_placement.id, other.id, actor=nurse_manager)
    changed = notices.share_with_students(actor=coordinator)
    assert changed["updated"] == 1
    notices_sent = OutboxEvent.objects.filter(event_type="PlacementProvisionalNotice")
    assert notices_sent.count() == 2 and notices_sent.filter(payload__update=True).count() == 1
    assert str(student.id) in notices_sent.first().payload["recipient_user_ids"]
    del mentor, dt


def test_lead_reminders_go_to_student_and_mentor_once(scheduled_placement, student, mentor):
    import datetime as dt

    from apps.core.models import OutboxEvent
    from apps.placements import notices

    today = scheduled_placement.planned_start - dt.timedelta(days=14)
    assert notices.send_lead_reminders(today=today) == 1
    assert notices.send_lead_reminders(today=today) == 0  # once only
    event = OutboxEvent.objects.get(event_type="PlacementStartsSoon")
    assert set(event.payload["recipient_user_ids"]) == {str(student.id), str(mentor.id)} and event.payload["days"] == 14


def test_facility_can_decline_with_a_reason_and_coordinator_can_ask_another_or_withdraw(program, institution, cohort, coordinator, nurse_manager, facility, ward):
    import uuid

    from rest_framework.test import APIClient

    from apps.core.models import OutboxEvent
    from apps.facilities.models import Facility, Ward
    from apps.placements.models import Placement

    ids = _requested_drafts(program, institution, cohort, coordinator, facility, 2)
    manager, coord = APIClient(), APIClient()
    manager.force_authenticate(nurse_manager)
    coord.force_authenticate(coordinator)
    key = lambda: {"HTTP_IDEMPOTENCY_KEY": str(uuid.uuid4())}  # noqa: E731

    assert manager.post("/api/v1/placements/decline-requests", {"placement_ids": [str(ids[0])], "reason": "no"}, format="json", **key()).status_code == 400
    declined = manager.post("/api/v1/placements/decline-requests", {"placement_ids": [str(ids[0])], "reason": "Ward closed for renovation"}, format="json", **key())
    assert declined.status_code == 200 and declined.json()["data"]["declined"] == 1
    row = Placement.objects.get(id=ids[0])
    assert row.requested_facility_id is None and row.declined_facility_id == facility.id and row.decline_reason == "Ward closed for renovation"
    assert OutboxEvent.objects.filter(event_type="PlacementsDeclined").exists()
    assert len(manager.get("/api/v1/placements/incoming").json()["data"]) == 1  # the other student is still waiting

    other = Facility.objects.create(program=program, name="Second Hospital")
    Ward.objects.create(facility=other, name="Second Ward", max_students=3)
    again = coord.post("/api/v1/placements/facility-requests", {"placement_ids": [str(ids[0])], "facility_ids": [str(other.id)], "mode": "even"}, format="json", **key())
    assert again.status_code == 201, again.content
    assert Placement.objects.get(id=ids[0]).requested_facility_id == other.id

    withdrawn = coord.post("/api/v1/placements/withdraw-requests", {"placement_ids": [str(ids[1])]}, format="json", **key())
    assert withdrawn.status_code == 200 and withdrawn.json()["data"]["withdrawn"] == 1
    assert Placement.objects.get(id=ids[1]).requested_facility_id is None
    assert len(manager.get("/api/v1/placements/incoming").json()["data"]) == 0
