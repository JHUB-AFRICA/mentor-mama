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


def test_library_lists_content_items_with_author_name(program):
    admin = program.users.create_user(email="lib-admin@example.test", password="pw", first_name="Lib", last_name="Admin", role=Role.PROGRAM_ADMIN, status="active", program=program)
    ContentItem.objects.create(program=program, created_by=admin, title="Lib guide", slug="lib-guide", body="Guide", visible_roles=[Role.MENTOR])
    client = APIClient()
    client.force_authenticate(admin)
    response = client.get("/api/v1/library")
    assert response.status_code == 200
    assert response.json()["data"][0]["updated_by"] == "Lib Admin"


def test_guide_can_be_created_from_the_multipart_form_the_portal_sends(program):
    import json

    admin = program.users.create_user(email="multipart-admin@example.test", password="pw", first_name="M", last_name="A", role=Role.PROGRAM_ADMIN, status="active", program=program)
    client = APIClient()
    client.force_authenticate(admin)
    response = client.post("/api/v1/content", {
        "title": "TEST", "slug": "test", "summary": "TEST", "body": json.dumps({"type": "doc", "content": [{"type": "paragraph"}]}),
        "content_type": "guide", "category": "onboarding", "visible_roles": json.dumps(["mentor", "student"]), "keep_published": "false",
    }, format="multipart", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert response.status_code == 201, response.content
    assert response.json()["data"]["visible_roles"] == ["mentor", "student"]


def test_guide_cover_is_saved_to_private_storage_and_served_back(program, mentor):
    from django.core.files.uploadedfile import SimpleUploadedFile
    from django.conf import settings

    admin = program.users.create_user(email="cover-admin@example.test", password="pw", first_name="C", last_name="A", role=Role.PROGRAM_ADMIN, status="active", program=program)
    client = APIClient()
    client.force_authenticate(admin)
    png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0\xf0\x1f\x00\x05\x00\x01\xff\x89\x99=\x1d\x00\x00\x00\x00IEND\xaeB`\x82")
    response = client.post("/api/v1/content", {"title": "Cover", "slug": "cover", "summary": "s", "body": "b", "content_type": "guide",
                                               "category": "general", "visible_roles": "[\"mentor\"]",
                                               "cover_image": SimpleUploadedFile("c.png", png, "image/png")}, format="multipart", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert response.status_code == 201, response.content
    item = ContentItem.objects.get(id=response.json()["data"]["id"])
    assert str(item.cover_image.path).startswith(str(settings.PRIVATE_CONTENT_ROOT))
    assert client.get(response.json()["data"]["cover_image"]).status_code == 200


def test_tags_search_facility_scope_and_inline_pdf(program, mentor, facility, student):
    import json

    admin = program.users.create_user(email="lib2-admin@example.test", password="pw", first_name="L", last_name="A", role=Role.PROGRAM_ADMIN, status="active", program=program)
    admin_client, mentor_client, student_client = APIClient(), APIClient(), APIClient()
    admin_client.force_authenticate(admin)
    mentor_client.force_authenticate(mentor)
    student_client.force_authenticate(student)
    body = json.dumps({"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hand hygiene before every patient contact"}]}]})

    def make(title, **extra):
        data = {"title": title, "slug": title.lower().replace(" ", "-"), "summary": "s", "body": body, "content_type": "guide", "category": "general",
                "visible_roles": json.dumps(["mentor", "student"]), **extra}
        created = admin_client.post("/api/v1/content", data, format="multipart", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
        assert created.status_code == 201, created.content
        item_id = created.json()["data"]["id"]
        admin_client.post(f"/api/v1/content/{item_id}/publish", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
        return item_id

    make("Hygiene guide", tags=json.dumps(["Infection Control", "ward"]))
    make("Facility only", facility_ids=json.dumps([str(uuid.uuid4())]))  # a facility the mentor is not at
    make("Our facility", facility_ids=json.dumps([str(mentor.facility_id)]))

    rows = {r["title"]: r for r in mentor_client.get("/api/v1/library").json()["data"]}
    assert "Hygiene guide" in rows and rows["Hygiene guide"]["tags"] == ["infection control", "ward"]
    assert "Facility only" not in rows and "Our facility" in rows
    assert "Our facility" not in {r["title"] for r in student_client.get("/api/v1/library").json()["data"]}  # students have no facility
    # Search reads the text, not the stored JSON keys; tags can be filtered.
    assert [r["title"] for r in mentor_client.get("/api/v1/library?search=hygiene").json()["data"]][0] in {"Hygiene guide", "Our facility"}
    assert mentor_client.get("/api/v1/library?search=paragraph").json()["data"] == []
    assert [r["title"] for r in mentor_client.get("/api/v1/library?tag=ward").json()["data"]] == ["Hygiene guide"]
    assert "ward" in mentor_client.get("/api/v1/library").json()["meta"]["tags"]
    hidden_id = next(r["id"] for r in admin_client.get("/api/v1/library").json()["data"] if r["title"] == "Facility only")
    assert mentor_client.get(f"/api/v1/content/{hidden_id}").status_code == 404
