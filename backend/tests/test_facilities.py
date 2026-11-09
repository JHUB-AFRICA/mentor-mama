"""Facility and ward scope contracts."""

import pytest
from rest_framework.test import APIClient

from apps.facilities.models import Facility, Ward


pytestmark = pytest.mark.django_db(transaction=True)


def test_nurse_manager_can_read_only_their_facility_and_wards(nurse_manager, facility, ward, program):
    other_facility = Facility.objects.create(program=program, name="Other Hospital")
    other_ward = Ward.objects.create(facility=other_facility, name="Other Ward", max_students=4)
    client = APIClient()
    client.force_authenticate(nurse_manager)

    facilities = client.get("/api/v1/facilities")
    wards = client.get("/api/v1/wards")

    assert facilities.status_code == 200
    assert {row["id"] for row in facilities.json()["data"]} == {str(facility.id)}
    assert wards.status_code == 200
    assert {row["id"] for row in wards.json()["data"]} == {str(ward.id)}
    assert str(other_ward.id) not in {row["id"] for row in wards.json()["data"]}


def test_nurse_manager_cannot_create_or_update_ward(nurse_manager, facility, ward):
    client = APIClient()
    client.force_authenticate(nurse_manager)

    created = client.post(
        "/api/v1/wards",
        {"facility_id": str(facility.id), "name": "New Ward", "max_students": 3},
        format="json",
    )
    updated = client.patch(
        f"/api/v1/wards/{ward.id}", {"max_students": 8}, format="json"
    )

    assert created.status_code == 403
    assert updated.status_code == 403
