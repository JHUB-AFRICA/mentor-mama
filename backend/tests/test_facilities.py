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


def test_nurse_manager_manages_wards_in_own_facility_only(nurse_manager, facility, ward, program):
    import uuid

    other_facility = Facility.objects.create(program=program, name="Other Hospital")
    other_ward = Ward.objects.create(facility=other_facility, name="Other Ward", max_students=4)
    client = APIClient()
    client.force_authenticate(nurse_manager)

    def headers():
        return {"HTTP_IDEMPOTENCY_KEY": str(uuid.uuid4())}

    created = client.post("/api/v1/wards", {"facility_id": str(facility.id), "name": "New Ward", "max_students": 3}, format="json", **headers())
    updated = client.patch(f"/api/v1/wards/{ward.id}", {"max_students": 8}, format="json", **headers())
    assert created.status_code == 201
    assert updated.status_code == 200 and updated.json()["data"]["max_students"] == 8

    # Another facility's wards stay out of reach.
    foreign_create = client.post("/api/v1/wards", {"facility_id": str(other_facility.id), "name": "Nope", "max_students": 3}, format="json", **headers())
    foreign_update = client.patch(f"/api/v1/wards/{other_ward.id}", {"max_students": 9}, format="json", **headers())
    assert foreign_create.status_code in {403, 404}
    assert foreign_update.status_code in {403, 404}
    other_ward.refresh_from_db()
    assert other_ward.max_students == 4
