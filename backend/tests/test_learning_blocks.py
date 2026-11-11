import io
import json
import uuid

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from apps.identity.models import Role
from apps.learning.blocks import InvalidBody, validate_body
from apps.learning.models import MediaAsset


def doc(*content):
    return json.dumps({"type": "doc", "content": list(content)})


def para(text, marks=None):
    return {"type": "paragraph", "content": [{"type": "text", "text": text, **({"marks": marks} if marks else {})}]}


MEDIA = f"/api/v1/training/media/{uuid.uuid4()}"


@pytest.mark.parametrize("body", [
    "plain legacy text", "42",
    doc(para("ok", [{"type": "bold"}, {"type": "link", "attrs": {"href": "https://who.int"}}])),
    doc({"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "H"}]}),
    doc({"type": "callout", "attrs": {"variant": "safety"}, "content": [para("Wash hands")]}),
    doc({"type": "image", "attrs": {"src": MEDIA, "alt": "A ward"}}),
])
def test_valid_bodies(body):
    validate_body(body)


@pytest.mark.parametrize("body", [
    doc({"type": "script"}),
    doc(para("x", [{"type": "link", "attrs": {"href": "javascript:alert(1)"}}])),
    doc(para("x", [{"type": "highlight"}])),
    doc({"type": "image", "attrs": {"src": "https://evil.example/x.png", "alt": "x"}}),
    doc({"type": "image", "attrs": {"src": "data:image/png;base64,AAAA", "alt": "x"}}),
    doc({"type": "image", "attrs": {"src": MEDIA, "alt": " "}}),
    doc({"type": "callout", "attrs": {"variant": "danger"}, "content": []}),
    doc({"type": "heading", "attrs": {"level": 9}, "content": []}),
    "x" * 300_000,
])
def test_rejected_bodies(body):
    with pytest.raises(InvalidBody):
        validate_body(body)


def _png():
    buffer = io.BytesIO()
    Image.new("RGB", (4, 3), "teal").save(buffer, "PNG")
    return buffer.getvalue()


def _admin(program):
    return program.users.create_user(email="media-admin@example.test", password="pw", first_name="M", last_name="A", role=Role.PROGRAM_ADMIN, status="active", program=program)


def test_media_upload_is_validated_and_private(program, mentor):
    client = APIClient()
    client.force_authenticate(_admin(program))
    headers = {"HTTP_IDEMPOTENCY_KEY": str(uuid.uuid4())}
    bad = client.post("/api/v1/training/media", {"file": SimpleUploadedFile("x.png", b"not an image", "image/png"), "alt": "x"}, format="multipart", **headers)
    assert bad.status_code in {400, 409}
    no_alt = client.post("/api/v1/training/media", {"file": SimpleUploadedFile("x.png", _png(), "image/png")}, format="multipart", **headers)
    assert no_alt.status_code in {400, 409}
    ok = client.post("/api/v1/training/media", {"file": SimpleUploadedFile("x.png", _png(), "image/png"), "alt": "A teal square"}, format="multipart", **headers)
    assert ok.status_code == 201 and ok.data["data"]["width"] == 4
    url = ok.data["data"]["url"]
    reader = APIClient()
    reader.force_authenticate(mentor)
    served = reader.get(url)
    assert served.status_code == 200 and served["Content-Type"] == "image/png" and served["X-Content-Type-Options"] == "nosniff"
    assert APIClient().get(url).status_code in {401, 403}
    # Mentors cannot upload.
    assert reader.post("/api/v1/training/media", {"file": SimpleUploadedFile("x.png", _png(), "image/png"), "alt": "x"}, format="multipart", **headers).status_code in {403, 404}
    assert MediaAsset.objects.count() == 1


def test_module_rejects_unsafe_lesson_body_and_keeps_sections(program):
    client = APIClient()
    client.force_authenticate(_admin(program))
    headers = {"HTTP_IDEMPOTENCY_KEY": str(uuid.uuid4())}
    unsafe = {"title": "M", "lessons": [{"title": "L", "body": doc(para("x", [{"type": "link", "attrs": {"href": "javascript:1"}}]))}]}
    assert client.post("/api/v1/training/modules/admin", unsafe, format="json", **headers).status_code == 400
    good = {"title": "M", "lessons": [{"title": "L", "body": doc(para("hi")), "section": "Basics"}]}
    created = client.post("/api/v1/training/modules/admin", good, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert created.status_code == 201 and created.data["data"]["lessons"][0]["section"] == "Basics"
