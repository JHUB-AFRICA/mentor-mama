from rest_framework.test import APIClient

from apps.assessments.models import FeedbackConfidential


def test_approved_feedback_is_scoped_and_audited(active_placement, coordinator, nurse_manager):
    feedback = FeedbackConfidential.objects.create(
        placement=active_placement,
        comments="The student asked for a clearer handover routine.",
    )

    coordinator_client = APIClient()
    coordinator_client.force_authenticate(coordinator)
    response = coordinator_client.get("/api/v1/feedback/approved")

    assert response.status_code == 200
    assert response.json()["data"] == [{
        "id": str(feedback.id),
        "placement_id": str(active_placement.id),
        "student_name": active_placement.student_assignments.filter(ended_at=None).first().student.full_name,
        "cohort_name": active_placement.cohort.name,
        "institution_name": active_placement.institution.name,
        "facility_name": active_placement.facility.name,
        "ward_name": active_placement.ward_assignments.filter(ended_at=None).first().ward.name,
        "comments": feedback.comments,
        "improvement_suggestion": "",
        "unresolved_concern": False,
        "submitted_at": feedback.submitted_at.isoformat(),
    }]

    nurse_client = APIClient()
    nurse_client.force_authenticate(nurse_manager)
    assert nurse_client.get("/api/v1/feedback/approved").status_code == 200


def test_feedback_review_requires_an_authorised_role(student):
    client = APIClient()
    client.force_authenticate(student)
    response = client.get("/api/v1/feedback/approved")
    # Scoped resources deliberately return 404 so unauthorized roles cannot
    # infer that confidential feedback exists.
    assert response.status_code == 404


def _ratings(**overrides):
    base = {"orientation": 4, "mentor_availability": 5, "constructive_feedback": 4, "confidence_this_week": 3, "respectful_environment": 5}
    base.update(overrides)
    rows = [{"question_code": code, "scale": "likert_1_5", "value_numeric": value} for code, value in base.items()]
    rows.append({"question_code": "knows_mentor", "scale": "yes_no", "value_boolean": True})
    return rows


def test_structured_student_feedback_records_ratings_and_unresolved_concern(active_placement, student):
    import uuid

    client = APIClient()
    client.force_authenticate(student)
    response = client.post(
        f"/api/v1/placements/{active_placement.id}/feedback",
        {"mode": "confidential", "responses": _ratings(), "unresolved_concern": True,
         "comments": "I still have no named contact for emergencies.", "improvement": "A written ward map."},
        format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert response.status_code == 201, response.content
    row = FeedbackConfidential.objects.get(placement=active_placement)
    assert row.unresolved_concern is True
    assert row.improvement_suggestion == "A written ward map."
    assert row.responses.count() == 6


def test_structured_feedback_rejects_unknown_questions_and_missing_concern_detail(active_placement, student):
    import uuid

    client = APIClient()
    client.force_authenticate(student)
    url = f"/api/v1/placements/{active_placement.id}/feedback"
    unknown = client.post(url, {"mode": "confidential", "responses": [{"question_code": "made_up", "scale": "likert_1_5", "value_numeric": 3}]}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert unknown.status_code == 400
    no_detail = client.post(url, {"mode": "confidential", "responses": _ratings(), "unresolved_concern": True}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert no_detail.status_code == 400
    assert not FeedbackConfidential.objects.filter(placement=active_placement).exists()


def test_student_records_starting_confidence_once(active_placement, student):
    import uuid

    from apps.assessments.models import Assessment, AssessmentKind

    client = APIClient()
    client.force_authenticate(student)
    url = f"/api/v1/placements/{active_placement.id}/assessments/baseline"
    assert client.get(url).json()["data"] == {"submitted": False, "can_submit": True}
    assert client.post(url, {"confidence_score": 140}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).status_code == 400
    assert client.post(url, {"confidence_score": 55}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).status_code == 201
    assert client.post(url, {"confidence_score": 60}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).status_code == 409
    assert Assessment.objects.filter(placement=active_placement, kind=AssessmentKind.BASELINE_CONFIDENCE).count() == 1
    assert client.get(url).json()["data"]["submitted"] is True
