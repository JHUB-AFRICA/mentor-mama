"""Mentor pending follow-ups (concept note 7.2 step 13)."""

from __future__ import annotations

import datetime as dt
import uuid

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import AuditEntry
from apps.mentorship import followups, services
from apps.mentorship.models import Session
from apps.placements import services as placement_services

pytestmark = pytest.mark.django_db(transaction=True)

HEADERS = {"HTTP_X_REQUESTED_WITH": "mentormama"}
SECRET = "Private ward conversation about a named situation"
FEEDBACK = "Private feedback wording"


def client_for(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def log(placement, mentor, action="practice_skill", *, age=None, day=10, covered=SECRET):
    """Log through the real service, then set the age (the window guard only checks inserts).

    Each ``day`` gets its own default age so two calls never collide on the duplicate-session guard.
    """
    age = day - 9 if age is None else age
    session = services.log_session(
        services.LogSession(
            placement_id=placement.id, session_date=dt.date(2026, 7, day), session_type="debrief",
            topics=("communication", "infection_control"), what_was_covered=covered,
            feedback_given=FEEDBACK, follow_up_action=action,
        ),
        actor=mentor,
    )
    Session.objects.filter(id=session.id).update(session_date=timezone.localdate() - dt.timedelta(days=age))
    session.refresh_from_db()
    return session


def listing(user, **params):
    response = client_for(user).get("/api/v1/follow-ups", params, **HEADERS)
    assert response.status_code == 200, response.content
    return response.json()


def test_pending_means_a_follow_up_action_that_is_not_resolved(active_placement, mentor):
    # Distinct dates avoid the five-minute duplicate guard.
    log(active_placement, mentor, "none", day=10)
    log(active_placement, mentor, "", day=11)
    wanted = log(active_placement, mentor, "repeat_demonstration", day=12)
    body = listing(mentor)
    assert [row["session_id"] for row in body["data"]] == [str(wanted.id)]
    assert body["meta"]["counts"]["pending"] == 1


def test_list_is_oldest_first_and_describes_the_follow_up(active_placement, mentor, student):
    newer = log(active_placement, mentor, "practice_skill", age=2, day=10)
    older = log(active_placement, mentor, "review_reading", age=5, day=11)
    rows = listing(mentor)["data"]
    assert [row["session_id"] for row in rows] == [str(older.id), str(newer.id)]
    first = rows[0]
    assert first["student"]["name"] == student.full_name
    assert first["ward"] == "Labour Ward"
    assert first["label"] == "Review reading"
    assert first["suggested_next_step"]
    assert first["age_days"] == 5
    assert first["topics"] == ["communication", "infection_control"] or sorted(first["topics"]) == ["communication", "infection_control"]
    assert first["status"] == "pending" and first["overdue"] is False


def test_overdue_after_seven_days_but_next_shift_after_one(active_placement, mentor):
    seven = log(active_placement, mentor, "practice_skill", age=7, day=10)
    eight = log(active_placement, mentor, "other", age=8, day=11)
    one = log(active_placement, mentor, "review_next_shift", age=1, day=12)
    two = log(active_placement, mentor, "review_next_shift", age=2, day=13)
    by_id = {row["session_id"]: row for row in listing(mentor)["data"]}
    assert by_id[str(seven.id)]["overdue"] is False
    assert by_id[str(eight.id)]["overdue"] is True
    assert by_id[str(one.id)]["overdue"] is False
    assert by_id[str(two.id)]["overdue"] is True
    assert listing(mentor)["meta"]["counts"]["overdue"] == 2


def test_student_support_is_flagged_and_counted_separately(active_placement, mentor):
    log(active_placement, mentor, "student_referral", day=10)
    log(active_placement, mentor, "practice_skill", day=11)
    body = listing(mentor)
    assert body["meta"]["counts"]["student_support"] == 1
    assert [row["is_student_support"] for row in body["data"]].count(True) == 1
    only = listing(mentor, action="student_referral")["data"]
    assert len(only) == 1 and only[0]["label"] == "Student support need"


def test_mark_done_reopen_and_idempotency(active_placement, mentor):
    session = log(active_placement, mentor, "practice_skill", age=3)
    url = f"/api/v1/follow-ups/{session.id}/done"
    first = client_for(mentor).post(url, {"note": "Practised twice on shift"}, format="json", **HEADERS)
    assert first.status_code == 200
    assert first.json()["data"]["status"] == "done"
    assert first.json()["data"]["note"] == "Practised twice on shift"
    assert first.json()["meta"]["changed"] is True
    again = client_for(mentor).post(url, {"note": "Something else"}, format="json", **HEADERS)
    assert again.json()["meta"]["changed"] is False
    assert again.json()["data"]["note"] == "Practised twice on shift"
    assert AuditEntry.objects.filter(action="session.follow_up_resolve", entity_id=session.id).count() == 1

    assert listing(mentor)["data"] == []
    done = listing(mentor, status="done")
    assert [row["session_id"] for row in done["data"]] == [str(session.id)]
    assert done["meta"]["counts"] == {"pending": 0, "overdue": 0, "student_support": 0, "done": 1}
    assert len(listing(mentor, status="all")["data"]) == 1

    reopen = client_for(mentor).post(f"/api/v1/follow-ups/{session.id}/reopen", {}, format="json", **HEADERS)
    assert reopen.status_code == 200 and reopen.json()["data"]["status"] == "pending"
    again = client_for(mentor).post(f"/api/v1/follow-ups/{session.id}/reopen", {}, format="json", **HEADERS)
    assert again.json()["meta"]["changed"] is False
    assert AuditEntry.objects.filter(action="session.follow_up_reopen", entity_id=session.id).count() == 1
    assert len(listing(mentor)["data"]) == 1


def test_note_is_limited(active_placement, mentor):
    session = log(active_placement, mentor)
    response = client_for(mentor).post(
        f"/api/v1/follow-ups/{session.id}/done", {"note": "x" * 281}, format="json", **HEADERS
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"]


def test_pending_first_ordering_when_listing_all(active_placement, mentor):
    done = log(active_placement, mentor, "practice_skill", age=9, day=10)
    pending = log(active_placement, mentor, "other", age=1, day=11)
    services.resolve_follow_up(done.id, actor=mentor)
    rows = listing(mentor, status="all")["data"]
    assert [row["session_id"] for row in rows] == [str(pending.id), str(done.id)]


def test_filters_by_student_placement_and_age(active_placement, mentor, student):
    old = log(active_placement, mentor, "practice_skill", age=10, day=10)
    log(active_placement, mentor, "other", age=1, day=11)
    body = listing(mentor, student_id=str(student.id))
    assert len(body["data"]) == 2
    assert body["meta"]["students"] == [{"id": str(student.id), "name": student.full_name}]
    assert listing(mentor, student_id=str(uuid.uuid4()))["data"] == []
    assert len(listing(mentor, placement_id=str(active_placement.id))["data"]) == 2
    assert [row["session_id"] for row in listing(mentor, min_age_days=7)["data"]] == [str(old.id)]


def test_pagination(active_placement, mentor):
    for day in range(10, 15):
        log(active_placement, mentor, "other", age=20 - day, day=day)
    first = listing(mentor, page_size=2)
    assert len(first["data"]) == 2 and first["meta"]["total"] == 5 and first["meta"]["pages"] == 3
    last = listing(mentor, page_size=2, page=3)
    assert len(last["data"]) == 1


def test_never_returns_free_text(active_placement, mentor):
    session = log(active_placement, mentor, "practice_skill")
    services.resolve_follow_up(session.id, actor=mentor, note="Done")
    for status_name in ("pending", "done", "all"):
        raw = client_for(mentor).get("/api/v1/follow-ups", {"status": status_name}, **HEADERS).content.decode()
        assert SECRET not in raw and FEEDBACK not in raw
        assert "what_was_covered" not in raw and "feedback_given" not in raw
    raw = client_for(mentor).post(f"/api/v1/follow-ups/{session.id}/reopen", {}, format="json", **HEADERS).content.decode()
    assert SECRET not in raw and FEEDBACK not in raw


def test_other_mentor_coordinator_and_student_get_nothing(active_placement, mentor, other_mentor, coordinator, student):
    session = log(active_placement, mentor, "practice_skill")
    assert listing(other_mentor)["data"] == []
    for outsider in (coordinator, student):
        assert client_for(outsider).get("/api/v1/follow-ups", **HEADERS).status_code == 404
        assert client_for(outsider).get("/api/v1/follow-ups/summary", **HEADERS).status_code == 404
        assert client_for(outsider).post(f"/api/v1/follow-ups/{session.id}/done", {}, format="json", **HEADERS).status_code == 404
    other = client_for(other_mentor).post(f"/api/v1/follow-ups/{session.id}/done", {}, format="json", **HEADERS)
    assert other.status_code == 404
    assert client_for(other_mentor).post(f"/api/v1/follow-ups/{session.id}/reopen", {}, format="json", **HEADERS).status_code == 404
    assert not Session.objects.filter(id=session.id, follow_up_resolution__isnull=False).exists()


def test_reassigned_placement_moves_the_open_follow_ups_with_it(active_placement, mentor, other_mentor, nurse_manager):
    session = log(active_placement, mentor, "practice_skill", age=2)
    placement_services.reassign_mentor(active_placement.id, other_mentor.id, actor=nurse_manager, reason="rota change")
    # The previous mentor no longer owns the placement, so cannot see or close it...
    assert listing(mentor)["data"] == []
    assert client_for(mentor).post(f"/api/v1/follow-ups/{session.id}/done", {}, format="json", **HEADERS).status_code == 404
    # ...the new mentor inherits it, and the history keeps the original author.
    rows = listing(other_mentor)["data"]
    assert [row["session_id"] for row in rows] == [str(session.id)]
    assert Session.objects.get(id=session.id).mentor_assignment.mentor_id == mentor.id
    assert client_for(other_mentor).post(f"/api/v1/follow-ups/{session.id}/done", {}, format="json", **HEADERS).status_code == 200


def test_session_synced_late_from_the_offline_queue_appears(active_placement, mentor):
    key = str(uuid.uuid4())
    response = client_for(mentor).post(
        f"/api/v1/placements/{active_placement.id}/sessions",
        {"session_date": "2026-07-10", "session_type": "debrief", "topics": ["communication"],
         "what_was_covered": SECRET, "follow_up_action": "review_reading"},
        format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS,
    )
    assert response.status_code == 201
    # Replaying the same queued command must not create a second follow-up.
    client_for(mentor).post(
        f"/api/v1/placements/{active_placement.id}/sessions",
        {"session_date": "2026-07-10", "session_type": "debrief", "topics": ["communication"],
         "what_was_covered": SECRET, "follow_up_action": "review_reading"},
        format="json", HTTP_IDEMPOTENCY_KEY=key, **HEADERS,
    )
    rows = listing(mentor)["data"]
    assert len(rows) == 1 and rows[0]["session_date"] == "2026-07-10"
    assert rows[0]["age_days"] > 7 and rows[0]["overdue"] is True


def test_summary_counts(active_placement, mentor):
    log(active_placement, mentor, "student_referral", age=9, day=10)
    log(active_placement, mentor, "other", age=1, day=11)
    body = client_for(mentor).get("/api/v1/follow-ups/summary", **HEADERS).json()["data"]
    assert body == {"pending": 2, "overdue": 1, "student_support": 1, "done": 0}


def test_nurse_manager_sees_and_closes_only_supervisor_follow_ups_on_their_facility(
    active_placement, mentor, nurse_manager, program,
):
    supervisor = log(active_placement, mentor, "supervisor_follow_up", day=10)
    ordinary = log(active_placement, mentor, "practice_skill", day=11)
    rows = listing(nurse_manager)["data"]
    assert [row["session_id"] for row in rows] == [str(supervisor.id)]
    assert client_for(nurse_manager).post(f"/api/v1/follow-ups/{ordinary.id}/done", {}, format="json", **HEADERS).status_code == 404
    done = client_for(nurse_manager).post(f"/api/v1/follow-ups/{supervisor.id}/done", {"note": "Spoke to the mentor"}, format="json", **HEADERS)
    assert done.status_code == 200 and done.json()["data"]["resolved_by"] == nurse_manager.full_name
    # The mentor sees the same item as done.
    assert [row["status"] for row in listing(mentor, status="done")["data"]] == ["done"]


def test_nurse_manager_of_another_facility_sees_nothing(active_placement, mentor, program):
    from apps.facilities.models import Facility
    from apps.identity.models import Role
    from tests.conftest import _user

    log(active_placement, mentor, "supervisor_follow_up")
    elsewhere = Facility.objects.create(program=program, name="Another Hospital")
    outsider = _user(program, Role.NURSE_MANAGER, "elsewhere@other.go.ke", facility=elsewhere)
    assert listing(outsider)["data"] == []


def test_session_serializer_shows_students_a_read_only_state(active_placement, mentor, student):
    session = log(active_placement, mentor, "practice_skill")
    rows = client_for(student).get(f"/api/v1/placements/{active_placement.id}/sessions", **HEADERS).json()["data"]
    assert rows[0]["follow_up_status"] == "pending"
    services.resolve_follow_up(session.id, actor=mentor, note="Private mentor note")
    response = client_for(student).get(f"/api/v1/placements/{active_placement.id}/sessions", **HEADERS)
    assert response.json()["data"][0]["follow_up_status"] == "done"
    assert "Private mentor note" not in response.content.decode()
    none_session = log(active_placement, mentor, "none", day=11)
    rows = client_for(student).get(f"/api/v1/placements/{active_placement.id}/sessions", **HEADERS).json()["data"]
    assert {row["id"]: row["follow_up_status"] for row in rows}[str(none_session.id)] is None


def test_followups_status_helper_is_none_without_an_action(active_placement, mentor):
    session = log(active_placement, mentor, "none")
    assert followups.status_of(session) == {"state": None, "resolved_at": None}
