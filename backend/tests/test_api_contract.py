"""API-level contracts: idempotency, scope isolation, error translation."""

from __future__ import annotations

import datetime as dt
import uuid

import pytest
from rest_framework.test import APIClient

from apps.identity.models import Program, Role, Status, User
from apps.institutions.models import Institution
from apps.mentorship.models import Session
from apps.placements.models import Placement

pytestmark = pytest.mark.django_db(transaction=True)

HEADERS = {"HTTP_X_REQUESTED_WITH": "mentormama"}


def client_for(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


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


def test_reusing_a_key_for_a_different_command_is_rejected(active_placement, mentor, nurse_manager):
    key = str(uuid.uuid4())
    client_for(mentor).post(
        f"/api/v1/placements/{active_placement.id}/sessions",
        {"session_date": "2026-07-10", "session_type": "debrief", "topics": ["communication"]},
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
    payload = {"session_date": "2026-07-10", "session_type": "debrief", "topics": ["communication"]}

    client.post(url, payload, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS)
    second = client.post(url, payload, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()), **HEADERS)

    assert second.status_code == 200
    assert second.json()["meta"]["duplicate"] is True
    assert Session.objects.filter(placement=active_placement).count() == 1


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
    assert response.json()["data"] == []


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
    assert [row["id"] for row in response.json()["data"]] == [str(active_placement.id)]


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
