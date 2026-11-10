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
    assert ContentRevision.objects.filter(item=item, version=1, title="Old guide").exists()


def _admin(program, email="lifecycle-admin@example.test"):
    return program.users.create_user(email=email, password="pw", first_name="Life", last_name="Cycle", role=Role.PROGRAM_ADMIN, status="active", program=program)


def _key():
    return {"HTTP_IDEMPOTENCY_KEY": str(uuid.uuid4())}


def test_content_lifecycle_unpublish_delete_and_duplicate(program, mentor):
    admin = _admin(program)
    item = ContentItem.objects.create(program=program, created_by=admin, title="Ward guide", slug="ward-guide", body="Guide", visible_roles=[Role.MENTOR])
    client = APIClient()
    client.force_authenticate(admin)
    client.post(f"/api/v1/content/{item.id}/publish", **_key())

    # A live item cannot be deleted; unpublish returns it to draft and hides it.
    assert client.delete(f"/api/v1/content/{item.id}", **_key()).status_code == 409
    unpublished = client.post(f"/api/v1/content/{item.id}/unpublish", **_key())
    assert unpublished.status_code == 200 and unpublished.json()["data"]["status"] == "draft"
    mentor_client = APIClient()
    mentor_client.force_authenticate(mentor)
    assert mentor_client.get("/api/v1/content").json()["data"] == []

    copy = client.post(f"/api/v1/content/{item.id}/duplicate", **_key())
    assert copy.status_code == 201
    assert copy.json()["data"]["title"] == "Ward guide (copy)"
    assert copy.json()["data"]["status"] == "draft"
    assert copy.json()["data"]["slug"] != item.slug

    assert client.delete(f"/api/v1/content/{item.id}", **_key()).status_code == 204
    assert not ContentItem.objects.filter(id=item.id).exists()
    assert mentor_client.delete(f"/api/v1/content/{copy.json()['data']['id']}", **_key()).status_code == 404


def test_content_revision_snapshots_previous_state_and_can_stay_published(program):
    admin = _admin(program, "keep-admin@example.test")
    item = ContentItem.objects.create(program=program, created_by=admin, title="Old", slug="old", body="Old body", is_published=True)
    client = APIClient()
    client.force_authenticate(admin)
    response = client.post(f"/api/v1/content/{item.id}/revise", {"title": "New", "slug": "new", "body": "New body", "keep_published": True}, format="json", **_key())
    assert response.status_code == 200
    item.refresh_from_db()
    assert item.is_published is True and item.title == "New"
    snapshot = ContentRevision.objects.get(item=item, version=1)
    assert (snapshot.title, snapshot.body) == ("Old", "Old body")
    history = client.get(f"/api/v1/content/{item.id}/revisions").json()["data"]
    assert [row["version"] for row in history] == [1]


def test_duplicate_titles_get_unique_slugs_instead_of_failing(program):
    admin = _admin(program, "slug-admin@example.test")
    client = APIClient()
    client.force_authenticate(admin)
    for _ in range(2):
        response = client.post("/api/v1/content", {"title": "Same", "slug": "same", "body": "Body"}, format="json", **_key())
        assert response.status_code == 201
    assert sorted(ContentItem.objects.values_list("slug", flat=True)) == ["same", "same-2"]
