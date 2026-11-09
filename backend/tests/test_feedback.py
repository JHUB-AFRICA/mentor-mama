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
