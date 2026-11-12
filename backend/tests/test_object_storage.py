"""Private uploads in S3-compatible object storage (Cloudflare R2 in production), against an in-memory S3."""

from __future__ import annotations

import io
import uuid

import pytest
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from PIL import Image
from rest_framework.test import APIClient

from apps.identity.models import Role

moto = pytest.importorskip("moto")
BUCKET = "mentor-mama-test"


@pytest.fixture
def bucket(settings, tmp_path):
    from apps.core import storage

    settings.FILE_STORAGE_BACKEND = "s3"
    settings.MEDIA_STORAGE_BUCKET = BUCKET
    settings.MEDIA_STORAGE_ENDPOINT = ""
    settings.MEDIA_STORAGE_REGION = "us-east-1"
    settings.MEDIA_STORAGE_PREFIX = "private"
    settings.OBJECT_STORAGE_ACCESS_KEY_ID = "test-access"
    settings.OBJECT_STORAGE_SECRET_ACCESS_KEY = "test-secret"
    settings.PRIVATE_CONTENT_ROOT = tmp_path
    storage._cached_client.cache_clear()
    with moto.mock_aws():
        client = storage.s3_client()
        client.create_bucket(Bucket=BUCKET)
        yield client
    storage._cached_client.cache_clear()


def _png(size=(4, 3)):
    buffer = io.BytesIO()
    Image.new("RGB", size, "teal").save(buffer, "PNG")
    return buffer.getvalue()


def _admin(program):
    return program.users.create_user(email=f"store-{uuid.uuid4().hex[:6]}@example.test", password="pw", first_name="S", last_name="A",
                                     role=Role.PROGRAM_ADMIN, status="active", program=program)


def test_endpoint_with_a_pasted_bucket_path_is_normalised():
    from apps.core.storage import normalise_endpoint

    assert normalise_endpoint("https://abc.r2.cloudflarestorage.com/mentor-mama") == "https://abc.r2.cloudflarestorage.com"
    assert normalise_endpoint("abc.r2.cloudflarestorage.com/") == "https://abc.r2.cloudflarestorage.com"
    assert normalise_endpoint("") == ""


def test_private_storage_selects_object_storage_only_when_configured(settings, bucket):
    from apps.core.storage import PrivateObjectStorage, private_storage

    assert isinstance(private_storage(), PrivateObjectStorage)
    settings.FILE_STORAGE_BACKEND = "local"
    assert not isinstance(private_storage(), PrivateObjectStorage)


def test_files_are_written_under_the_private_prefix_and_read_back(bucket):
    from apps.core.storage import private_storage

    store = private_storage()
    name = store.save("content/covers/cover.png", ContentFile(_png()))
    assert bucket.head_object(Bucket=BUCKET, Key=f"private/{name}")["ContentLength"] > 0
    with store.open(name) as handle:
        assert handle.read().startswith(b"\x89PNG")
    # Never overwritten: a second file with the same name gets a new one.
    assert store.save("content/covers/cover.png", ContentFile(_png())) != name
    store.delete(name)
    assert not store.exists(name)


def test_files_not_yet_copied_are_read_from_the_old_disk(bucket, tmp_path):
    from apps.core.storage import private_storage

    (tmp_path / "learning" / "covers").mkdir(parents=True)
    (tmp_path / "learning" / "covers" / "old.png").write_bytes(_png())
    store = private_storage()
    assert store.exists("learning/covers/old.png")
    with store.open("learning/covers/old.png") as handle:
        assert handle.read().startswith(b"\x89PNG")
    assert not store.exists("learning/covers/never-uploaded.png")


def test_copy_command_moves_disk_files_into_the_bucket_and_is_idempotent(bucket, tmp_path, facility, capsys):
    from apps.facilities.models import Facility

    (tmp_path / "partners" / "logos").mkdir(parents=True)
    (tmp_path / "partners" / "logos" / "knh.png").write_bytes(_png())
    Facility.objects.filter(id=facility.id).update(logo="partners/logos/knh.png")

    call_command("copy_media_to_object_storage", "--dry-run")
    assert "would copy 1" in capsys.readouterr().out
    with pytest.raises(Exception):
        bucket.head_object(Bucket=BUCKET, Key="private/partners/logos/knh.png")

    call_command("copy_media_to_object_storage")
    assert "copied 1" in capsys.readouterr().out
    assert bucket.head_object(Bucket=BUCKET, Key="private/partners/logos/knh.png")["ContentType"] == "image/png"

    call_command("copy_media_to_object_storage")
    assert "already in the bucket 1" in capsys.readouterr().out
    # The disk copy is left in place.
    assert (tmp_path / "partners" / "logos" / "knh.png").is_file()


def test_exports_use_the_shared_bucket_under_their_own_prefix(settings, bucket):
    from apps.analytics.storage import S3ExportStorage

    settings.EXPORT_STORAGE_BUCKET = BUCKET
    store = S3ExportStorage()
    store.save("abc.csv", b"a,b\n1,2\n")
    assert bucket.head_object(Bucket=BUCKET, Key="exports/abc.csv")["ContentType"] == "text/csv"
    assert store.exists("abc.csv") and not store.exists("missing.csv")
    assert store.open("abc.csv").read() == b"a,b\n1,2\n"


def test_status_check_reports_the_bucket(settings, bucket):
    from apps.platform import status

    state, detail = status._storage()
    assert state == "ok" and BUCKET in detail
    settings.MEDIA_STORAGE_BUCKET = "no-such-bucket"
    state, detail = status._storage()
    assert state == "down" and "not found" in detail


def test_a_missing_stored_file_returns_a_clear_404_not_a_server_error(program, tmp_path, settings):
    from apps.learning.models import TrainingModule

    settings.PRIVATE_CONTENT_ROOT = tmp_path
    admin = _admin(program)
    module = TrainingModule.objects.create(program=program, title="Gone", slug="gone", cover_image="learning/covers/gone.png")
    client = APIClient()
    client.force_authenticate(admin)
    response = client.get(f"/api/v1/training/modules/{module.id}/cover")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "FileUnavailable"


def test_a_file_named_like_an_image_is_refused_as_a_cover(program):
    client = APIClient()
    client.force_authenticate(_admin(program))
    response = client.post("/api/v1/content", {
        "title": "Fake", "slug": "fake", "body": "b", "content_type": "guide", "category": "general", "visible_roles": "[\"mentor\"]",
        "cover_image": SimpleUploadedFile("c.png", b"<svg onload=alert(1)>", "image/png"),
    }, format="multipart", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert response.status_code == 400
    assert "readable image" in response.json()["error"]["message"]


def test_cover_urls_change_when_the_cover_changes_and_may_be_cached(program):
    client = APIClient()
    client.force_authenticate(_admin(program))
    created = client.post("/api/v1/content", {
        "title": "Cover", "slug": "cover-v", "body": "b", "content_type": "guide", "category": "general", "visible_roles": "[\"mentor\"]",
        "cover_image": SimpleUploadedFile("c.png", _png(), "image/png"),
    }, format="multipart", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert created.status_code == 201, created.content
    url = created.json()["data"]["cover_image"]
    assert "?v=" in url
    served = client.get(url)
    assert served.status_code == 200 and "max-age" in served["Cache-Control"]
    revised = client.post(f"/api/v1/content/{created.json()['data']['id']}/revise", {
        "title": "Cover", "slug": "cover-v", "body": "b", "content_type": "guide", "category": "general", "visible_roles": "[\"mentor\"]",
        "cover_image": SimpleUploadedFile("c.png", _png((5, 5)), "image/png"),
    }, format="multipart", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert revised.status_code == 200, revised.content
    assert revised.json()["data"]["cover_image"] != url


def test_an_oversized_request_gets_a_clear_413(program, settings):
    settings.DATA_UPLOAD_MAX_MEMORY_SIZE = 1024
    client = APIClient()
    client.force_authenticate(_admin(program))
    response = client.post("/api/v1/content", {"title": "Big", "slug": "big", "content_type": "guide", "body": "x" * 5000},
                           format="multipart", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "RequestTooLarge"
