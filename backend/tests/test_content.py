import uuid

from rest_framework.test import APIClient

from apps.content.models import ContentItem, ContentRevision
from apps.identity.models import Role


def test_content_is_hidden_until_published_and_filtered_by_role(program, mentor, student):
    admin = program.users.create_user(email="content-admin@example.test", password="pw", first_name="Content", last_name="Admin", role=Role.PROGRAM_ADMIN, status="active", program=program)
    item = ContentItem.objects.create(program=program, created_by=admin, title="Ward guide", slug="ward-guide", body="Guide", visible_roles=[Role.MENTOR])
    mentor_client = APIClient()
    mentor_client.force_authenticate(mentor)
    assert mentor_client.get("/api/v1/content").json()["data"] == []
    admin_client = APIClient()
    admin_client.force_authenticate(admin)
    assert admin_client.get("/api/v1/content").json()["data"][0]["published"] is False
    assert admin_client.post(f"/api/v1/content/{item.id}/publish", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).status_code == 200
    assert mentor_client.get("/api/v1/content").json()["data"][0]["title"] == "Ward guide"
    student_client = APIClient()
    student_client.force_authenticate(student)
    assert student_client.get("/api/v1/content").json()["data"] == []


def test_published_content_revision_unpublishes_new_copy(program):
    admin = program.users.create_user(email="revision-admin@example.test", password="pw", first_name="Revision", last_name="Admin", role=Role.PROGRAM_ADMIN, status="active", program=program)
    item = ContentItem.objects.create(program=program, created_by=admin, title="Old guide", slug="old-guide", body="Old")
    client = APIClient()
    client.force_authenticate(admin)
    client.post(f"/api/v1/content/{item.id}/publish", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    response = client.post(f"/api/v1/content/{item.id}/revise", {"title": "Updated guide", "slug": "updated-guide", "body": "Updated"}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert response.status_code == 200
    item.refresh_from_db()
    assert item.is_published is False
    assert item.title == "Updated guide"
    assert ContentRevision.objects.filter(item=item, version=1, title="Updated guide").exists()
