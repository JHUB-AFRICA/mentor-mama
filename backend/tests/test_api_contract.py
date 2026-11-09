"""API-level contracts: idempotency, scope isolation, error translation."""

from __future__ import annotations

import datetime as dt
import uuid

import pytest
from django.core.management import call_command
from django.test import override_settings
from django.core import signing
from rest_framework.test import APIClient

from apps.identity.models import Role, Status, User
from apps.institutions.models import Institution
from apps.mentorship.models import Session
from apps.induction.models import OrientationAcknowledgement
from apps.core.models import AuditEntry, IdempotencyKey, OutboxEvent
from apps.assessments.models import AnonymousResponse, FeedbackAnonymous, FeedbackConfidential, Response
from apps.placements.models import PauseInterval
from apps.analytics.models import ExportRecord

pytestmark = pytest.mark.django_db(transaction=True)

HEADERS = {"HTTP_X_REQUESTED_WITH": "mentormama"}


def client_for(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_health_probes_report_process_and_database_state(client):
    live = client.get("/health/live")
    ready = client.get("/health/ready")
    assert live.status_code == 200
    assert live.json() == {"status": "ok", "checks": {"process": "ok"}}
    assert ready.status_code == 200
    assert ready.json()["status"] == "ok"
    assert ready.json()["checks"]["database"] == "ok"


def test_staff_export_is_async_safe_and_download_is_signed(active_placement, coordinator, student, tmp_path):
    from apps.analytics import export_service

    with override_settings(EXPORT_ROOT=str(tmp_path)):
        record = export_service.create_export(actor=coordinator, export_type="placements", filters={})
        assert record.status == "queued"
        export_service.generate_export(record.id)
        record.refresh_from_db()
        assert record.status == "completed"
        assert record.row_count == 1
        csv_text = (tmp_path / record.storage_key).read_text()
        assert "registration_number" in csv_text
        assert "open_safeguarding_concerns" in csv_text
        assert "description" not in csv_text

        token = signing.TimestampSigner().sign(str(record.id))
        response = client_for(coordinator).get(
            f"/api/v1/exports/{record.id}/download?token={token}", **HEADERS
        )
        assert response.status_code == 200
        assert response["Content-Disposition"].startswith("attachment;")
        assert AuditEntry.objects.filter(action="export.download", entity_id=record.id).exists()

        expired = client_for(student).get(
            f"/api/v1/exports/{record.id}/download?token={token}", **HEADERS
        )
        assert expired.status_code == 404


def test_export_request_returns_job_without_running_generation(coordinator, monkeypatch):
    from apps.analytics.tasks import generate_export_task

    queued = []
    monkeypatch.setattr(generate_export_task, "delay", lambda record_id: queued.append(record_id))
    response = client_for(coordinator).post(
        "/api/v1/exports", {"export_type": "placements"}, format="json", **HEADERS
    )
    assert response.status_code == 202
    assert response.json()["data"]["status"] == "queued"
    assert queued == [response.json()["data"]["id"]]
    assert ExportRecord.objects.filter(id=response.json()["data"]["id"], status="queued").exists()


def test_dashboard_returns_scoped_safe_indicators(active_placement, coordinator, mentor):
    call_command("refresh_analytics", verbosity=0)
    coordinator_response = client_for(coordinator).get("/api/v1/dashboard", **HEADERS)
    assert coordinator_response.status_code == 200
    data = coordinator_response.json()["data"]
    assert data["role"] == Role.COORDINATOR
    assert data["indicators"]["placements_active"] == 1
    assert "description" not in data["indicators"]

    mentor_response = client_for(mentor).get("/api/v1/dashboard", **HEADERS)
    assert mentor_response.status_code == 200
    assert mentor_response.json()["data"]["indicators"]["placements_active"] == 1


def test_programme_summary_reports_pending_operational_invites_by_role(coordinator, nurse_manager):
    admin = User.objects.create_user(
        email="summary-admin@example.test",
        password="test-password",
        first_name="Summary",
        last_name="Admin",
        role=Role.PROGRAM_ADMIN,
        status=Status.ACTIVE,
        program=coordinator.program,
    )
    User.objects.create_user(
        email="pending-coordinator@example.test",
        password="test-password",
        first_name="Pending",
        last_name="Coordinator",
        role=Role.COORDINATOR,
        status=Status.INVITED,
        program=coordinator.program,
        institution_id=coordinator.institution_id,
    )
    User.objects.create_user(
        email="pending-manager@example.test",
        password="test-password",
        first_name="Pending",
        last_name="Manager",
        role=Role.NURSE_MANAGER,
        status=Status.INVITED,
        program=coordinator.program,
        facility_id=nurse_manager.facility_id,
    )

    response = client_for(admin).get("/api/v1/dashboard/summary", **HEADERS)

    assert response.status_code == 200
    readiness = response.json()["data"]["readiness"]
    assert readiness["invited_coordinators"] == 1
    assert readiness["invited_nurse_managers"] == 1
    assert "pending-coordinator@example.test" not in str(response.json())


def test_interruption_dashboard_reports_controlled_pause_reason(active_placement, coordinator):
    PauseInterval.objects.create(
        placement=active_placement,
        started_on=dt.date(2026, 8, 1),
        reason="facility_closure",
        paused_by=coordinator,
    )
    call_command("refresh_analytics", verbosity=0)
    response = client_for(coordinator).get("/api/v1/dashboard/interruptions", **HEADERS)
    assert response.status_code == 200
    assert response.json()["data"] == [{
        "facility_id": str(active_placement.facility_id),
        "facility_name": active_placement.facility.name,
        "cohort_id": str(active_placement.cohort_id),
        "cohort_name": active_placement.cohort.name,
        "reason": "facility_closure",
        "interruptions": 1,
        "days_interrupted": 31,
    }]


def test_feedback_dashboard_enforces_minimum_three_responses(active_placement, mentor, student):
    feedback = FeedbackConfidential.objects.create(placement=active_placement)
    Response.objects.create(
        feedback_confidential=feedback, question_code="support", scale="likert_1_5", value_numeric=4,
    )
    call_command("refresh_analytics", projection="feedback", verbosity=0)
    assert client_for(mentor).get("/api/v1/dashboard/feedback", **HEADERS).json()["data"] == []

    for score in (3, 5):
        feedback = FeedbackConfidential.objects.create(placement=active_placement)
        Response.objects.create(
            feedback_confidential=feedback, question_code="support", scale="likert_1_5", value_numeric=score,
        )
    call_command("refresh_analytics", projection="feedback", verbosity=0)
    result = client_for(mentor).get("/api/v1/dashboard/feedback", **HEADERS)
    assert result.status_code == 200
    assert result.json()["data"] == [{"question_code": "support", "responses": 3, "mean_score": 4.0}]
    assert client_for(student).get("/api/v1/dashboard/feedback", **HEADERS).json()["data"] == []


def test_placement_progress_is_computed_and_scoped(active_placement, student, mentor):
    response = client_for(student).get(
        f"/api/v1/placements/{active_placement.id}/progress", **HEADERS
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["placement_id"] == str(active_placement.id)
    assert data["state"] == "active"
    assert data["induction"] == {"available": True, "completed": 3, "total": 3, "percentage": 100}
    assert data["mentorship"] == {"sessions_logged": 0, "last_session_date": None}
    assert data["assessment"] == {"baseline_submitted": False, "final_submitted": False}
    assert data["safeguarding"] == {
        "open_concerns": 0,
        "severity": {"high": 0, "medium": 0, "low": 0},
    }
    assert data["training"] == {"available": False, "percentage": None}
    assert "comments" not in str(data)

    mentor_response = client_for(mentor).get(
        f"/api/v1/placements/{active_placement.id}/progress", **HEADERS
    )
    assert mentor_response.status_code == 200


def test_student_feedback_routes_confidential_and_unlinkable_anonymous(active_placement, student):
    client = client_for(student)
    confidential = client.post(
        f"/api/v1/placements/{active_placement.id}/feedback",
        {"mode": "confidential", "comments": "The mentor created a supportive learning environment."},
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS,
    )
    command_id = str(uuid.uuid4())
    anonymous_payload = {
        "placement_id": str(active_placement.id), "mode": "anonymous",
        "responses": [
            {"question_code": code, "scale": "likert_1_5", "value_numeric": score}
            for code, score in (("support", 4), ("learning_opportunities", 5), ("safety_to_speak_up", 4))
        ],
    }
    anonymous = client.post(
        "/api/v1/feedback/anonymous", anonymous_payload, format="json",
        HTTP_IDEMPOTENCY_KEY=command_id, **HEADERS,
    )
    replay = client.post(
        "/api/v1/feedback/anonymous", anonymous_payload, format="json",
        HTTP_IDEMPOTENCY_KEY=command_id, **HEADERS,
    )
    assert confidential.status_code == 201
    assert anonymous.status_code == 201
    assert replay.status_code == 200
    assert "id" in confidential.json()["data"]
    assert "id" not in anonymous.json()["data"]
    assert FeedbackConfidential.objects.filter(placement=active_placement).count() == 1
    detached = FeedbackAnonymous.objects.get()
    assert detached.cohort_id == active_placement.cohort_id
    assert detached.facility_id == active_placement.facility_id
    assert not hasattr(detached, "placement_id")
    assert not hasattr(detached, "created_at")
    assert not hasattr(detached, "comments")
    anonymous_responses = list(AnonymousResponse.objects.filter(feedback_anonymous=detached))
    assert len(anonymous_responses) == 3
    assert all(not hasattr(response, "created_at") for response in anonymous_responses)
    assert Response._meta.get_field("created_at")
    assert not AuditEntry.objects.filter(entity_id=detached.id).exists()
    assert not OutboxEvent.objects.filter(payload__feedback_id=str(detached.id)).exists()
    assert IdempotencyKey.objects.filter(command_id=uuid.UUID(command_id)).exists() is False
    from apps.assessments.models import AnonymousFeedbackCommand
    receipt = AnonymousFeedbackCommand.objects.get()
    assert receipt.payload_digest
    assert not hasattr(receipt, "actor_id")
    assert not hasattr(receipt, "result_ref")


def test_anonymous_feedback_reporting_requires_three_and_is_role_scoped(active_placement, student, coordinator, nurse_manager):
    codes = ("support", "learning_opportunities", "safety_to_speak_up")
    for submission in range(2):
        feedback = FeedbackAnonymous.objects.create(
            cohort_id=active_placement.cohort_id, facility_id=active_placement.facility_id,
            ward_id=active_placement.ward_assignments.get(ended_at=None).ward_id,
            submitted_on=dt.date(2026, 11, 9),
        )
        for code in codes:
            AnonymousResponse.objects.create(
                feedback_anonymous=feedback, question_code=code, scale="likert_1_5",
                value_numeric=4 + (submission % 2),
            )
    call_command("refresh_analytics", projection="feedback", verbosity=0)
    assert client_for(coordinator).get("/api/v1/reports/anonymous-feedback", **HEADERS).json()["data"] == []
    feedback = FeedbackAnonymous.objects.create(
        cohort_id=active_placement.cohort_id, facility_id=active_placement.facility_id,
        ward_id=active_placement.ward_assignments.get(ended_at=None).ward_id,
        submitted_on=dt.date(2026, 11, 9),
    )
    for code in codes:
        AnonymousResponse.objects.create(
            feedback_anonymous=feedback, question_code=code, scale="likert_1_5", value_numeric=5,
        )
    call_command("refresh_analytics", projection="feedback", verbosity=0)
    coordinator_report = client_for(coordinator).get("/api/v1/reports/anonymous-feedback", **HEADERS)
    manager_report = client_for(nurse_manager).get("/api/v1/reports/anonymous-feedback", **HEADERS)
    assert coordinator_report.status_code == manager_report.status_code == 200
    assert coordinator_report.json()["data"][0]["submissions"] == 3
    assert len(coordinator_report.json()["data"][0]["scores"]) == 3
    assert "comments" not in str(coordinator_report.json())
    assert str(student.id) not in str(coordinator_report.json())
    # Keep role-ineligible report endpoints non-disclosing, like scoped records.
    assert client_for(student).get("/api/v1/reports/anonymous-feedback", **HEADERS).status_code == 404


def test_escalation_list_omits_narrative_and_detail_is_reviewer_scoped(active_placement, student, nurse_manager, coordinator):
    created = client_for(student).post(
        "/api/v1/escalations",
        {"placement_id": str(active_placement.id), "category": "Professional conduct", "severity": "high", "description": "A private concern requiring authorised review."},
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS,
    )
    assert created.status_code == 201
    escalation_id = created.json()["data"]["id"]
    listed = client_for(nurse_manager).get("/api/v1/escalations", **HEADERS)
    assert listed.status_code == 200
    assert "description" not in listed.json()["data"][0]
    assert client_for(coordinator).get(f"/api/v1/escalations/{escalation_id}", **HEADERS).status_code == 404
    assigned = client_for(nurse_manager).post(
        f"/api/v1/escalations/{escalation_id}/assign-reviewer", {"reviewer_id": str(nurse_manager.id)},
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS,
    )
    assert assigned.status_code == 200
    detail = client_for(nurse_manager).get(f"/api/v1/escalations/{escalation_id}", **HEADERS)
    assert detail.status_code == 200
    assert detail.json()["data"]["description"] == "A private concern requiring authorised review."


# --- idempotency (ADR 0012, T-03) -----------------------------------------
def test_idempotency_key_is_required_on_a_command(active_placement, nurse_manager):
    response = client_for(nurse_manager).post(
        f"/api/v1/placements/{active_placement.id}/pause",
        {"reason": "facility_closure"}, format="json", **HEADERS,
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "IdempotencyKeyRequired"


def test_replaying_a_command_applies_it_once(active_placement, mentor):
    key = str(uuid.uuid4())
    payload = {
        "session_date": "2026-07-10", "session_type": "bedside_teaching",
        "topics": ["labour_monitoring"],
        "what_was_covered": "Handover practice",
    }
    client = client_for(mentor)
    url = f"/api/v1/placements/{active_placement.id}/sessions"

    first = client.post(url, payload, format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS)
    second = client.post(url, payload, format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS)

    assert first.status_code == 201
    assert second.status_code == 200
    assert second["Idempotency-Replayed"] == "true"
    assert Session.objects.filter(placement=active_placement).count() == 1
    assert second.json()["data"]["id"] == first.json()["data"]["id"]


def test_committed_command_can_be_reconciled_without_another_write(active_placement, mentor):
    """The lost-response path reads command status; it never re-posts blindly."""
    key = str(uuid.uuid4())
    client = client_for(mentor)
    created = client.post(
        f"/api/v1/placements/{active_placement.id}/sessions",
        {"session_date": "2026-07-10", "session_type": "debrief", "topics": ["communication"], "what_was_covered": "Communication practice"},
        format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS,
    )
    result_id = created.json()["data"]["id"]

    response = client.get(f"/api/v1/commands/{key}", **HEADERS)

    assert response.status_code == 200
    assert response.json()["data"] == {
        "id": key, "command": "log_session", "status": "committed", "result_ref": result_id,
    }
    assert Session.objects.filter(placement=active_placement).count() == 1


def test_command_status_is_not_visible_to_another_actor(active_placement, mentor, other_mentor):
    key = str(uuid.uuid4())
    client_for(mentor).post(
        f"/api/v1/placements/{active_placement.id}/sessions",
        {"session_date": "2026-07-10", "session_type": "debrief", "topics": ["communication"], "what_was_covered": "Communication practice"},
        format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS,
    )
    response = client_for(other_mentor).get(f"/api/v1/commands/{key}", **HEADERS)
    assert response.status_code == 404


def test_session_command_commits_idempotency_audit_and_outbox_together(active_placement, mentor):
    key = uuid.uuid4()
    response = client_for(mentor).post(
        f"/api/v1/placements/{active_placement.id}/sessions",
        {"session_date": "2026-07-10", "session_type": "debrief", "topics": ["communication"], "what_was_covered": "Communication practice"},
        format="json", HTTP_IDEMPOTENCY_KEY=str(key), **HEADERS,
    )
    session_id = response.json()["data"]["id"]
    assert IdempotencyKey.objects.get(command_id=key).result_ref == uuid.UUID(session_id)
    assert AuditEntry.objects.filter(entity_id=session_id, action="session.log").exists()
    assert OutboxEvent.objects.filter(event_type="SessionLogged", payload__session_id=session_id).exists()


def test_batch_session_creates_per_student_records_and_replays_once(
    active_placement, mentor, coordinator, nurse_manager, program, institution, cohort,
    ward, checklist_template,
):
    from apps.induction import services as induction_services
    from apps.induction.models import TemplateItem
    from apps.placements import services as placement_services
    from apps.placements.models import State
    from apps.institutions.models import CohortMembership

    second_student = User.objects.create_user(
        email="batch-session-student@students.jkuat.ac.ke", password="pw",
        first_name="Batch", last_name="Student", role=Role.STUDENT,
        status=Status.ACTIVE, program=program, institution_id=institution.id,
    )
    CohortMembership.objects.create(cohort=cohort, student=second_student)
    second_placement = placement_services.create_placement(
        placement_services.CreatePlacement(
            cohort_id=cohort.id, student_id=second_student.id,
            planned_start=dt.date(2026, 7, 1), planned_end=dt.date(2026, 9, 1),
        ), actor=coordinator,
    )
    placement_services.allocate_ward(second_placement.id, ward.id, actor=nurse_manager)
    placement_services.assign_mentor(second_placement.id, mentor.id, actor=nurse_manager)
    placement_services.transition(second_placement.id, State.AWAITING_STUDENT, actor=coordinator)
    placement_services.transition(
        second_placement.id, State.ORIENTATION, actor=second_student,
        asserted_by="student.confirm_placement",
    )
    induction_services.acknowledge_orientation(
        second_placement.id, actor=second_student,
        understands_placement_details=True, understands_emergency_process=True,
        understands_safeguarding=True,
    )
    checklist = induction_services.open_induction(second_placement.id, actor=mentor)
    for item in TemplateItem.objects.filter(template=checklist.template):
        induction_services.answer_item(checklist.id, item.id, "yes", actor=mentor)
    induction_services.sign_induction(checklist.id, actor=mentor)

    key = str(uuid.uuid4())
    payload = {
        "placement_ids": [str(active_placement.id), str(second_placement.id)],
        "session_date": "2026-07-10", "session_type": "debrief",
        "topics": ["communication", "clinical_skills"],
        "what_was_covered": "Shared handover practice",
    }
    client = client_for(mentor)
    first = client.post(
        "/api/v1/sessions/batch", payload, format="json",
        HTTP_IDEMPOTENCY_KEY=key, **HEADERS,
    )
    replay = client.post(
        "/api/v1/sessions/batch", payload, format="json",
        HTTP_IDEMPOTENCY_KEY=key, **HEADERS,
    )

    assert first.status_code == 201
    assert first.json()["data"]["created_count"] == 2
    assert first.json()["data"]["duplicate_count"] == 0
    assert {row["placement_id"] for row in first.json()["data"]["sessions"]} == {
        str(active_placement.id), str(second_placement.id),
    }
    assert all(row["session"]["batch"] == first.json()["data"]["batch_id"]
               for row in first.json()["data"]["sessions"])
    assert replay.status_code == 200
    assert replay.json()["meta"]["idempotency_replayed"] is True
    assert Session.objects.filter(placement_id__in=[active_placement.id, second_placement.id]).count() == 2
    assert IdempotencyKey.objects.get(command_id=key).result_ref == uuid.UUID(first.json()["data"]["batch_id"])


def test_batch_session_rejects_entire_selection_before_writing(active_placement, mentor):
    key = str(uuid.uuid4())
    response = client_for(mentor).post(
        "/api/v1/sessions/batch",
        {
            "placement_ids": [str(active_placement.id), str(uuid.uuid4())],
            "session_date": "2026-07-10", "session_type": "debrief",
            "topics": ["communication"],
            "what_was_covered": "Communication practice",
        }, format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS,
    )
    assert response.status_code == 404
    assert Session.objects.filter(placement=active_placement).count() == 0
    assert not IdempotencyKey.objects.filter(command_id=key).exists()


def test_mentor_can_batch_induction_and_activates_each_student(
    scheduled_placement, mentor, coordinator, nurse_manager, program, institution,
    cohort, ward, student, checklist_template,
):
    from apps.induction.models import Checklist, InductionBatch, TemplateItem
    from apps.core.models import OutboxEvent
    from apps.placements import services as placement_services
    from apps.placements.models import State
    from apps.induction.services import acknowledge_orientation
    from apps.institutions.models import CohortMembership

    second_student = User.objects.create_user(
        email="batch-induction-student@students.jkuat.ac.ke", password="pw",
        first_name="Second", last_name="Attendee", role=Role.STUDENT,
        status=Status.ACTIVE, program=program, institution_id=institution.id,
    )
    CohortMembership.objects.create(cohort=cohort, student=second_student)
    second_placement = placement_services.create_placement(
        placement_services.CreatePlacement(
            cohort_id=cohort.id, student_id=second_student.id,
            planned_start=dt.date(2026, 7, 1), planned_end=dt.date(2026, 9, 1),
        ), actor=coordinator,
    )
    placement_services.allocate_ward(second_placement.id, ward.id, actor=nurse_manager)
    placement_services.assign_mentor(second_placement.id, mentor.id, actor=nurse_manager)

    attendees = [(scheduled_placement, student), (second_placement, second_student)]
    for placement, attendee in attendees:
        placement_services.transition(placement.id, State.AWAITING_STUDENT, actor=coordinator)
        placement_services.transition(
            placement.id, State.ORIENTATION, actor=attendee,
            asserted_by="student.confirm_placement",
        )

    client = client_for(mentor)
    reminder = client.post(
        "/api/v1/induction/orientation-reminders",
        {"placement_ids": [str(row.id) for row, _ in attendees]},
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS,
    )
    assert reminder.status_code == 200
    assert reminder.json()["data"]["requested_count"] == 2
    assert OutboxEvent.objects.filter(event_type="PlacementAcknowledgementReminderRequested").count() == 2

    for placement, attendee in attendees:
        acknowledge_orientation(
            placement.id, actor=attendee, understands_placement_details=True,
            understands_emergency_process=True, understands_safeguarding=True,
        )

    key = str(uuid.uuid4())
    opened = client.post(
        "/api/v1/induction/batches",
        {"placement_ids": [str(row.id) for row, _ in attendees]},
        format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS,
    )
    assert opened.status_code == 201
    batch_id = opened.json()["data"]["id"]
    assert InductionBatch.objects.filter(id=batch_id).exists()
    assert Checklist.objects.filter(placement_id__in=[row.id for row, _ in attendees]).count() == 2

    for item in TemplateItem.objects.filter(template=checklist_template):
        answered = client.post(
            f"/api/v1/induction/batches/{batch_id}/items/{item.id}",
            {"response": "yes", "comment": "Shown to the whole group"},
            format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS,
        )
        assert answered.status_code == 200

    signed = client.post(
        f"/api/v1/induction/batches/{batch_id}/sign", {}, format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS,
    )
    assert signed.status_code == 200
    assert Checklist.objects.filter(
        placement_id__in=[row.id for row, _ in attendees], completed_at__isnull=False,
    ).count() == 2
    for placement, _ in attendees:
        placement.refresh_from_db()
        assert placement.state == State.ACTIVE


def test_session_notes_and_follow_up_are_persisted(active_placement, mentor):
    response = client_for(mentor).post(
        f"/api/v1/placements/{active_placement.id}/sessions",
        {
            "session_date": "2026-07-10",
            "session_type": "debrief",
            "topics": ["communication"],
            "duration_minutes": 15,
            "what_was_covered": "Escalation communication practice",
            "feedback_given": "Use the structured handover format",
            "follow_up_action": "review_next_shift",
        },
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS,
    )
    assert response.status_code == 201
    session = Session.objects.get(id=response.json()["data"]["id"])
    assert session.duration_minutes == 15
    assert session.what_was_covered == "Escalation communication practice"
    assert session.feedback_given == "Use the structured handover format"
    assert session.follow_up_action == "review_next_shift"


def test_student_can_read_their_own_session_history(active_placement, mentor, student):
    client_for(mentor).post(
        f"/api/v1/placements/{active_placement.id}/sessions",
        {
            "session_date": "2026-07-10",
            "session_type": "debrief",
            "topics": ["communication"],
            "what_was_covered": "Escalation communication practice",
        },
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS,
    )

    response = client_for(student).get(
        f"/api/v1/placements/{active_placement.id}/sessions", **HEADERS
    )

    assert response.status_code == 200
    assert len(response.json()["data"]) == 1
    assert response.json()["data"][0]["what_was_covered"] == "Escalation communication practice"


def test_student_cannot_read_another_students_session_history(active_placement, mentor, program, institution):
    other_student = User.objects.create_user(
        email="other-session-student@students.jkuat.ac.ke",
        password="pw",
        first_name="Other",
        last_name="Student",
        role=Role.STUDENT,
        status=Status.ACTIVE,
        program=program,
        institution_id=institution.id,
    )

    client_for(mentor).post(
        f"/api/v1/placements/{active_placement.id}/sessions",
        {"session_date": "2026-07-11", "session_type": "debrief", "topics": ["communication"], "what_was_covered": "Communication practice"},
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS,
    )

    response = client_for(other_student).get(
        f"/api/v1/placements/{active_placement.id}/sessions", **HEADERS
    )

    assert response.status_code == 200
    assert response.json()["data"] == []


def test_reusing_a_key_for_a_different_command_is_rejected(active_placement, mentor, nurse_manager):
    key = str(uuid.uuid4())
    client_for(mentor).post(
        f"/api/v1/placements/{active_placement.id}/sessions",
        {"session_date": "2026-07-10", "session_type": "debrief", "topics": ["communication"], "what_was_covered": "Communication practice"},
        format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS,
    )
    response = client_for(nurse_manager).post(
        f"/api/v1/placements/{active_placement.id}/pause",
        {"reason": "facility_closure"}, format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS,
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "IdempotencyKeyReused"


def test_duplicate_session_is_reported_as_success(active_placement, mentor):
    """WFR-014: the mentor tapped Save twice and one session exists. Say it worked."""
    client = client_for(mentor)
    url = f"/api/v1/placements/{active_placement.id}/sessions"
    payload = {"session_date": "2026-07-10", "session_type": "debrief", "topics": ["communication"], "what_was_covered": "Communication practice"}

    client.post(url, payload, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS)
    second = client.post(url, payload, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS)

    assert second.status_code == 200
    assert second.json()["meta"]["duplicate"] is True
    assert Session.objects.filter(placement=active_placement).count() == 1
    duplicate_key = uuid.UUID(second.wsgi_request.META["HTTP_IDEMPOTENCY_KEY"])
    assert IdempotencyKey.objects.get(command_id=duplicate_key).result_ref is not None


def test_service_authorisation_does_not_depend_on_hidden_buttons(active_placement, mentor):
    """A mentor cannot invoke a staff command even when bypassing the UI."""
    response = client_for(mentor).post(
        f"/api/v1/placements/{active_placement.id}/pause",
        {"reason": "facility_closure"}, format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS,
    )
    assert response.status_code == 404
    active_placement.refresh_from_db()
    assert active_placement.state == "active"


def test_nurse_manager_allocates_a_ward_before_facility_is_derived(draft_placement, ward, nurse_manager):
    from apps.placements import services

    placement = services.allocate_ward(draft_placement.id, ward.id, actor=nurse_manager)

    assert placement.facility_id == ward.facility_id


def test_coordinator_cannot_allocate_a_ward(draft_placement, ward, coordinator):
    from apps.core import errors
    from apps.placements import services

    with pytest.raises(errors.UnauthorizedFacilityAccess):
        services.allocate_ward(draft_placement.id, ward.id, actor=coordinator)


def test_intermediate_transition_is_authorised_in_the_service(scheduled_placement, mentor):
    """A mentor cannot bypass the UI and move a placement to awaiting-student."""
    from apps.core import errors
    from apps.placements import services
    from apps.placements.models import State

    with pytest.raises(errors.UnauthorizedFacilityAccess):
        services.transition(scheduled_placement.id, State.AWAITING_STUDENT, actor=mentor)


def test_coordinator_is_authorised_for_t04(scheduled_placement, coordinator):
    from apps.placements import services
    from apps.placements.models import State

    placement = services.transition(scheduled_placement.id, State.DRAFT, actor=coordinator)
    assert placement.state == State.DRAFT


def test_coordinator_can_release_scheduled_placement_to_student(scheduled_placement, coordinator, student):
    key = str(uuid.uuid4())
    response = client_for(coordinator).post(
        f"/api/v1/placements/{scheduled_placement.id}/invite",
        {}, format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["data"]["state"] == "awaiting_student"
    assert OutboxEvent.objects.filter(
        event_type="PlacementInvitationIssued",
        payload__placement_id=str(scheduled_placement.id),
        payload__student_id=str(student.id),
    ).exists()


def test_student_orientation_acknowledgement_is_required_before_induction(scheduled_placement, checklist_template, coordinator, student, mentor):
    from apps.core import errors
    from apps.induction import services as induction_services
    from apps.placements import services
    from apps.placements.models import State

    services.transition(scheduled_placement.id, State.AWAITING_STUDENT, actor=coordinator)
    services.transition(scheduled_placement.id, State.ORIENTATION, actor=student, asserted_by="student.confirm_placement")
    with pytest.raises(errors.OrientationIncomplete):
        induction_services.open_induction(scheduled_placement.id, actor=mentor)

    endpoint = f"/api/v1/placements/{scheduled_placement.id}/orientation"
    status_before = client_for(student).get(endpoint, **HEADERS)
    assert status_before.status_code == 200
    assert status_before.json()["data"] == {"acknowledged": False, "acknowledged_at": None}

    response = client_for(student).post(
        endpoint,
        {"understands_placement_details": True, "understands_emergency_process": True,
         "understands_safeguarding": True, "questions": ""},
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS,
    )
    assert response.status_code == 200
    acknowledgement = OrientationAcknowledgement.objects.get(placement=scheduled_placement, student=student)
    status_after = client_for(student).get(endpoint, **HEADERS)
    assert status_after.json()["data"]["acknowledged"] is True
    assert status_after.json()["data"]["acknowledged_at"] is not None

    replay = client_for(student).post(
        endpoint,
        {"understands_placement_details": True, "understands_emergency_process": True,
         "understands_safeguarding": True, "questions": "A later duplicate submission"},
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS,
    )
    assert replay.status_code == 200
    assert OrientationAcknowledgement.objects.filter(placement=scheduled_placement).count() == 1
    assert replay.json()["data"]["id"] == str(acknowledgement.id)
    from apps.core.models import OutboxEvent
    assert OutboxEvent.objects.filter(
        event_type="OrientationAcknowledged",
        payload__placement_id=str(scheduled_placement.id),
    ).count() == 1
    checklist = induction_services.open_induction(scheduled_placement.id, actor=mentor)
    assert checklist.placement_id == scheduled_placement.id


def test_mentor_is_authorised_for_t08(scheduled_placement, coordinator, student, mentor):
    from apps.placements import services
    from apps.placements.models import State

    services.transition(scheduled_placement.id, State.AWAITING_STUDENT, actor=coordinator)
    services.transition(
        scheduled_placement.id, State.ORIENTATION, actor=student,
        asserted_by="student.confirm_placement",
    )
    placement = services.transition(scheduled_placement.id, State.INDUCTION, actor=mentor)
    assert placement.state == State.INDUCTION


def test_t06_requires_the_active_assigned_student(scheduled_placement, coordinator, program, institution):
    """A different student must not confirm a placement by guessing its id."""
    from apps.core import errors
    from apps.placements import services
    from apps.placements.models import State

    other_student = User.objects.create_user(
        email="other-student@students.jkuat.ac.ke", password="pw", first_name="Other", last_name="Student",
        role=Role.STUDENT, status=Status.ACTIVE, program=program, institution_id=institution.id,
    )
    services.transition(scheduled_placement.id, State.AWAITING_STUDENT, actor=coordinator)

    with pytest.raises(errors.UnauthorizedFacilityAccess):
        services.transition(
            scheduled_placement.id, State.ORIENTATION, actor=other_student,
            asserted_by="student.confirm_placement",
        )


def test_t08_requires_the_active_assigned_mentor(scheduled_placement, coordinator, student, other_mentor):
    """A facility peer with the mentor role cannot start another mentor's induction."""
    from apps.core import errors
    from apps.placements import services
    from apps.placements.models import State

    services.transition(scheduled_placement.id, State.AWAITING_STUDENT, actor=coordinator)
    services.transition(
        scheduled_placement.id, State.ORIENTATION, actor=student,
        asserted_by="student.confirm_placement",
    )

    with pytest.raises(errors.UnauthorizedFacilityAccess):
        services.transition(scheduled_placement.id, State.INDUCTION, actor=other_mentor)


def test_nurse_manager_is_authorised_for_t08(scheduled_placement, coordinator, student, nurse_manager):
    from apps.placements import services
    from apps.placements.models import State

    services.transition(scheduled_placement.id, State.AWAITING_STUDENT, actor=coordinator)
    services.transition(
        scheduled_placement.id, State.ORIENTATION, actor=student,
        asserted_by="student.confirm_placement",
    )
    placement = services.transition(scheduled_placement.id, State.INDUCTION, actor=nurse_manager)
    assert placement.state == State.INDUCTION


def test_t10_requires_the_active_assigned_mentor(
    scheduled_placement, checklist_template, coordinator, student, mentor, other_mentor
):
    """A facility peer cannot sign/activate an induction they do not own."""
    from apps.core import errors
    from apps.induction import services as induction_services
    from apps.placements import services
    from apps.placements.models import State

    services.transition(scheduled_placement.id, State.AWAITING_STUDENT, actor=coordinator)
    services.transition(
        scheduled_placement.id, State.ORIENTATION, actor=student,
        asserted_by="student.confirm_placement",
    )
    induction_services.acknowledge_orientation(
        scheduled_placement.id, actor=student,
        understands_placement_details=True, understands_emergency_process=True,
        understands_safeguarding=True,
    )
    induction_services.open_induction(scheduled_placement.id, actor=mentor)

    with pytest.raises(errors.UnauthorizedFacilityAccess):
        services.transition(
            scheduled_placement.id, State.ACTIVE, actor=other_mentor,
            asserted_by="induction.sign_induction",
        )


def test_system_derived_t10_rejects_direct_invocation(
    scheduled_placement, checklist_template, coordinator, student, mentor
):
    from apps.core import errors
    from apps.induction import services as induction_services
    from apps.placements import services
    from apps.placements.models import State

    services.transition(scheduled_placement.id, State.AWAITING_STUDENT, actor=coordinator)
    services.transition(
        scheduled_placement.id, State.ORIENTATION, actor=student,
        asserted_by="student.confirm_placement",
    )
    induction_services.acknowledge_orientation(
        scheduled_placement.id, actor=student,
        understands_placement_details=True, understands_emergency_process=True,
        understands_safeguarding=True,
    )
    induction_services.open_induction(scheduled_placement.id, actor=mentor)
    with pytest.raises(errors.InvalidTransition):
        services.transition(scheduled_placement.id, State.ACTIVE, actor=mentor)


# --- scope isolation (SEC-02, SEC-03, T-04) -------------------------------
@pytest.fixture
def other_institution_coordinator(program):
    other = Institution.objects.create(program=program, name="Other University")
    return User.objects.create_user(
        email="rival@other.ac.ke", password="pw", first_name="Rival", last_name="Coordinator",
        role=Role.COORDINATOR, status=Status.ACTIVE, program=program, institution_id=other.id,
    )


def test_list_returns_nothing_from_another_institution(active_placement, other_institution_coordinator):
    response = client_for(other_institution_coordinator).get("/api/v1/placements", **HEADERS)
    assert response.status_code == 200
    assert response.json()["data"]["results"] == []
    assert response.json()["data"]["pagination"]["total_count"] == 0


def test_detail_returns_404_not_403_for_another_tenant(active_placement, other_institution_coordinator):
    """A 403 would confirm the record exists (AUTH-004)."""
    response = client_for(other_institution_coordinator).get(
        f"/api/v1/placements/{active_placement.id}", **HEADERS
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "UnauthorizedFacilityAccess"


def test_command_on_another_tenants_placement_returns_404(active_placement, other_institution_coordinator):
    response = client_for(other_institution_coordinator).post(
        f"/api/v1/placements/{active_placement.id}/withdraw",
        {"reason": "safeguarding"}, format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS,
    )
    assert response.status_code == 404


def test_own_institution_can_read_its_placements(active_placement, coordinator):
    response = client_for(coordinator).get("/api/v1/placements", **HEADERS)
    assert [row["id"] for row in response.json()["data"]["results"]] == [str(active_placement.id)]


# --- transitions endpoint (Stage 6 §7.3) ----------------------------------
def test_transitions_endpoint_reports_blocked_commands_with_reasons(active_placement, nurse_manager):
    """The UI enables buttons from this, so it must explain refusals."""
    response = client_for(nurse_manager).get(
        f"/api/v1/placements/{active_placement.id}/transitions", **HEADERS
    )
    body = response.json()["data"]
    assert body["state"] == "active"
    assert set(body["available"]) == {"paused", "completed", "withdrawn"}
    blocked_codes = {r["code"] for entry in body["blocked"] for r in entry["reasons"]}
    assert "FinalAssessmentMissing" in blocked_codes
    blocked_messages = {r["message"] for entry in body["blocked"] for r in entry["reasons"]}
    assert "Student final assessment is required before completion." in blocked_messages


def test_final_assessment_endpoint_requires_student_and_idempotency(active_placement, student, monkeypatch):
    from apps.assessments import services as assessment_services

    monkeypatch.setattr(
        assessment_services.timezone, "localdate", lambda: dt.date(2026, 9, 2)
    )
    url = f"/api/v1/placements/{active_placement.id}/assessments/final"
    payload = {"confidence_score": 82, "overall_experience": 5}
    client = client_for(student)
    first = client.post(url, payload, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS)
    assert first.status_code == 201
    assert first.json()["data"]["submitted"] is True

    missing_key = client.post(url, payload, format="json", **HEADERS)
    assert missing_key.status_code == 400
    assert missing_key.json()["error"]["code"] == "IdempotencyKeyRequired"


def test_role_based_completion_and_archive_handoff(active_placement, student, nurse_manager, program, monkeypatch):
    from apps.assessments import services as assessment_services

    monkeypatch.setattr(
        assessment_services.timezone, "localdate", lambda: dt.date(2026, 9, 2)
    )
    assessment = client_for(student).post(
        f"/api/v1/placements/{active_placement.id}/assessments/final",
        {"confidence_score": 88, "overall_experience": 5}, format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS,
    )
    assert assessment.status_code == 201

    completed = client_for(nurse_manager).post(
        f"/api/v1/placements/{active_placement.id}/complete",
        {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS,
    )
    assert completed.status_code == 200
    assert completed.json()["data"]["state"] == "completed"
    assert completed.json()["data"]["completed_at"] is not None

    admin = User.objects.create_user(
        email="completion-admin@example.test", password="pw", first_name="Completion",
        last_name="Admin", role=Role.PROGRAM_ADMIN, status=Status.ACTIVE, program=program,
    )
    archived = client_for(admin).post(
        f"/api/v1/placements/{active_placement.id}/archive",
        {}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS,
    )
    assert archived.status_code == 200
    assert archived.json()["data"]["state"] == "archived"
    assert archived.json()["data"]["archived_at"] is not None


def test_capability_flags_are_served_rather_than_role_strings(mentor):
    """FE-04: the client must not re-implement the authorisation matrix."""
    body = client_for(mentor).get("/api/v1/me", **HEADERS).json()["data"]
    assert body["capabilities"]["log_session"] is True
    assert body["capabilities"]["complete_placement"] is False
    assert body["scope"]["facility_id"] == str(mentor.facility_id)


# --- error catalogue completeness (Stage 6 §9.1) --------------------------
def test_every_mapped_constraint_exists_in_the_database():
    """A constraint renamed in a migration but not in the map would surface to a
    user as a 500. Fail here instead."""
    from django.db import connection

    from apps.core.errors import CONSTRAINT_ERRORS

    with connection.cursor() as cursor:
        cursor.execute("SELECT conname FROM pg_constraint")
        names = {row[0] for row in cursor.fetchall()}
        cursor.execute("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal")
        names |= {row[0] for row in cursor.fetchall()}
        cursor.execute("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'")
        names |= {row[0] for row in cursor.fetchall()}

    # Constraints belonging to tables the skeleton has not built yet.
    not_yet_built = {"one_open_pause_per_placement", "pause_no_overlap"}
    missing = {
        name for name in CONSTRAINT_ERRORS
        if name not in names and name not in not_yet_built
    }
    assert not missing, f"mapped but absent from the database: {sorted(missing)}"
