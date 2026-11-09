"""Institution-owned cohort and enrolment contracts."""

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity.models import Role, Status, User
from apps.institutions.models import Cohort, CohortMembership, Institution


pytestmark = pytest.mark.django_db(transaction=True)


def test_coordinator_can_create_cohort_and_enrol_institution_student(coordinator, institution, student):
    client = APIClient()
    client.force_authenticate(coordinator)

    created = client.post("/api/v1/cohorts", {
        "name": "2027 Term 1",
        "start_date": "2027-01-10",
        "end_date": "2027-06-30",
        "planned_capacity": 40,
    }, format="json")
    assert created.status_code == 201
    cohort_id = created.json()["data"]["id"]

    enrolled = client.post(f"/api/v1/cohorts/{cohort_id}/enrolments", {"student_id": str(student.id)}, format="json")
    assert enrolled.status_code == 201
    assert enrolled.json()["data"]["created"] is True
    assert CohortMembership.objects.filter(student=student).count() == 2


def test_coordinator_cannot_enrol_student_in_overlapping_cohort(coordinator, institution, student, cohort):
    overlapping = Cohort.objects.create(
        institution=institution,
        name="Overlapping Term",
        start_date="2026-11-01",
        end_date="2027-03-01",
    )
    client = APIClient()
    client.force_authenticate(coordinator)

    response = client.post(
        f"/api/v1/cohorts/{overlapping.id}/enrolments",
        {"student_id": str(student.id)},
        format="json",
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CohortOverlap"
    assert not CohortMembership.objects.filter(cohort=overlapping, student=student).exists()

    replay = client.post(f"/api/v1/cohorts/{cohort.id}/enrolments", {"student_id": str(student.id)}, format="json")
    assert replay.status_code == 200
    assert replay.json()["data"]["created"] is False
    assert CohortMembership.objects.filter(student=student).count() == 1


def test_coordinator_roster_reports_and_filters_cohort_assignment(coordinator, institution, student, program):
    unassigned = User.objects.create_user(
        email="unassigned.student@example.com", password="pw", first_name="Unassigned",
        last_name="Student", role=Role.STUDENT, status=Status.ACTIVE, program=program,
        institution_id=institution.id, registration_number="UNASSIGNED-001",
    )
    archived = Cohort.objects.create(
        institution=institution,
        name="Archived cohort",
        start_date="2025-01-01",
        end_date="2025-06-01",
        archived_at=timezone.now(),
    )
    archived_member = User.objects.create_user(
        email="archived.member@example.com", password="pw", first_name="Archived",
        last_name="Member", role=Role.STUDENT, status=Status.ACTIVE, program=program,
        institution_id=institution.id,
    )
    CohortMembership.objects.create(cohort=archived, student=archived_member)
    client = APIClient()
    client.force_authenticate(coordinator)

    assigned = client.get("/api/v1/institution/students?cohort_status=assigned")
    assert assigned.status_code == 200
    assigned_row = next(row for row in assigned.json()["data"]["results"] if row["id"] == str(student.id))
    assert assigned_row["cohort_names"]
    assert all(row["id"] != str(unassigned.id) for row in assigned.json()["data"]["results"])
    assert all(row["id"] != str(archived_member.id) for row in assigned.json()["data"]["results"])

    available = client.get("/api/v1/institution/students?cohort_status=unassigned")
    assert available.status_code == 200
    assert any(row["id"] == str(unassigned.id) for row in available.json()["data"]["results"])
    assert all(row["id"] != str(student.id) for row in available.json()["data"]["results"])
    assert any(row["id"] == str(archived_member.id) for row in available.json()["data"]["results"])


def test_deactivated_students_are_hidden_by_default_but_available_to_explicit_status_filter(
    coordinator, institution, program,
):
    deactivated = User.objects.create_user(
        email="deactivated.student@example.com", password="pw", first_name="Deactivated",
        last_name="Student", role=Role.STUDENT, status=Status.DEACTIVATED, program=program,
        institution_id=institution.id,
    )
    other_institution = Institution.objects.create(program=program, name="Other Nursing School")
    other_deactivated = User.objects.create_user(
        email="other.deactivated.student@example.com", password="pw", first_name="Other",
        last_name="Deactivated", role=Role.STUDENT, status=Status.DEACTIVATED, program=program,
        institution_id=other_institution.id,
    )
    client = APIClient()
    client.force_authenticate(coordinator)

    default_roster = client.get("/api/v1/institution/students")
    assert default_roster.status_code == 200
    assert all(row["id"] != str(deactivated.id) for row in default_roster.json()["data"]["results"])

    deactivated_filter = client.get("/api/v1/institution/students?status=deactivated")
    assert deactivated_filter.status_code == 200
    assert [row["id"] for row in deactivated_filter.json()["data"]["results"]] == [str(deactivated.id)]
    assert all(row["id"] != str(other_deactivated.id) for row in deactivated_filter.json()["data"]["results"])

def test_coordinator_cannot_enrol_student_from_another_institution(coordinator, program, institution, cohort):
    other_institution = Institution.objects.create(program=program, name="Other Nursing School")
    other_student = User.objects.create_user(
        email="other.student@example.com",
        password="pw",
        first_name="Other",
        last_name="Student",
        role=Role.STUDENT,
        status=Status.ACTIVE,
        program=program,
        institution_id=other_institution.id,
    )
    client = APIClient()
    client.force_authenticate(coordinator)

    response = client.post(f"/api/v1/cohorts/{cohort.id}/enrolments", {"student_id": str(other_student.id)}, format="json")
    assert response.status_code == 404
    assert not CohortMembership.objects.filter(student=other_student).exists()


def test_membership_removal_preserves_audited_history_and_allows_reenrolment(coordinator, cohort, student):
    client = APIClient()
    client.force_authenticate(coordinator)
    original = CohortMembership.objects.get(cohort=cohort, student=student)

    removed = client.post(f"/api/v1/cohorts/{cohort.id}/memberships/remove", {
        "student_id": str(student.id), "reason": "Student transferred groups",
    }, format="json")

    assert removed.status_code == 200
    original.refresh_from_db()
    assert original.removed_at is not None
    assert original.removed_by_id == coordinator.id
    assert original.removal_reason == "Student transferred groups"

    enrolled = client.post(f"/api/v1/cohorts/{cohort.id}/enrolments", {"student_id": str(student.id)}, format="json")
    assert enrolled.status_code == 201
    assert CohortMembership.objects.filter(cohort=cohort, student=student).count() == 2
    assert CohortMembership.objects.filter(cohort=cohort, student=student, removed_at=None).count() == 1


def test_cohort_dates_are_validated_at_the_transport_boundary(coordinator):
    client = APIClient()
    client.force_authenticate(coordinator)
    response = client.post("/api/v1/cohorts", {
        "name": "Invalid dates",
        "start_date": "2027-06-30",
        "end_date": "2027-01-10",
    }, format="json")
    assert response.status_code == 400


def test_student_invitation_requires_registration_number(coordinator):
    client = APIClient()
    client.force_authenticate(coordinator)
    response = client.post("/api/v1/auth/invitations/students/bulk", {
        "rows": [{"email": "missing-id@example.com", "first_name": "Missing", "last_name": "Id", "phone": "+254700000001"}],
        "dry_run": True,
    }, format="json")
    assert response.status_code == 400


def test_student_registration_number_is_normalized_and_stored(coordinator):
    client = APIClient()
    client.force_authenticate(coordinator)
    response = client.post("/api/v1/auth/invitations/students/bulk", {
        "rows": [{
            "email": "identified@example.com", "first_name": "Identified", "last_name": "Student",
            "registration_number": " stu-2026-0042 ", "phone": "+254700000002",
        }],
        "dry_run": False,
    }, format="json")
    assert response.status_code == 200
    person = User.objects.get(email="identified@example.com")
    assert person.registration_number == "STU-2026-0042"
    assert person.phone == "+254700000002"
    assert response.json()["data"]["results"][0]["status"] == "invited"


def test_student_can_manage_their_private_profile(student):
    client = APIClient()
    client.force_authenticate(student)
    response = client.patch("/api/v1/student/profile", {
        "course_name": "Bachelor of Science in Nursing",
        "year_of_study": 4,
        "date_of_birth": "2002-05-14",
        "emergency_contact_name": "Grace Student",
        "emergency_contact_phone": "+254700000099",
        "emergency_contact_relationship": "Parent",
    }, format="json")
    assert response.status_code == 200
    assert response.json()["data"]["course_name"] == "Bachelor of Science in Nursing"
    assert response.json()["data"]["year_of_study"] == 4
    assert client.get("/api/v1/student/profile").json()["data"]["emergency_contact_phone"] == "+254700000099"


def test_non_student_cannot_access_student_profile(coordinator):
    client = APIClient()
    client.force_authenticate(coordinator)
    assert client.get("/api/v1/student/profile").status_code == 404
