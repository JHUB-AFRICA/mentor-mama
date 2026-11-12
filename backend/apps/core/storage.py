"""Private file storage: Cloudflare R2 (S3-compatible) in production, a local folder in development.

Every uploaded file (library documents and covers, module covers, lesson images, partner logos) goes through
``private_storage``. Nothing is public: files are served only through authenticated API endpoints with
``file_response``, so the portal keeps first-party cookies and its strict Content-Security-Policy.

``FILE_STORAGE_BACKEND=s3`` selects object storage. While files are being moved off the old persistent disk,
reads that miss in the bucket fall back to ``PRIVATE_CONTENT_ROOT`` (see ``copy_media_to_object_storage``).
"""

from __future__ import annotations

import hashlib
import logging
import mimetypes
from functools import lru_cache
from urllib.parse import urlsplit

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files.storage import FileSystemStorage
from django.http import FileResponse, JsonResponse
from django.utils.deconstruct import deconstructible

logger = logging.getLogger(__name__)

#: Files larger than this are buffered on local temporary disk instead of memory when read from the bucket.
_READ_BUFFER_BYTES = 5 * 1024 * 1024


def normalise_endpoint(endpoint: str) -> str:
    """R2 endpoints are ``https://<account>.r2.cloudflarestorage.com``; a pasted ``/<bucket>`` path is dropped."""
    endpoint = (endpoint or "").strip()
    if not endpoint:
        return ""
    parts = urlsplit(endpoint if "://" in endpoint else f"https://{endpoint}")
    return f"{parts.scheme}://{parts.netloc}"


def object_storage_options() -> dict:
    """Connection settings shared by uploads and exports."""
    return {
        "endpoint_url": normalise_endpoint(getattr(settings, "MEDIA_STORAGE_ENDPOINT", "")) or None,
        "region_name": getattr(settings, "MEDIA_STORAGE_REGION", "") or "auto",
        "access_key": getattr(settings, "OBJECT_STORAGE_ACCESS_KEY_ID", "") or None,
        "secret_key": getattr(settings, "OBJECT_STORAGE_SECRET_ACCESS_KEY", "") or None,
    }


def client_config():
    """botocore settings that R2 accepts.

    Recent boto3 releases add CRC checksums to every upload by default, which R2 rejects for some operations;
    "when_required" keeps them only where the S3 API demands them. Timeouts and retries are bounded so a slow
    bucket fails a request quickly instead of tying up a web worker.
    """
    from botocore.config import Config

    return Config(
        signature_version="s3v4",
        s3={"addressing_style": "path"},
        request_checksum_calculation="when_required",
        response_checksum_validation="when_required",
        connect_timeout=5,
        read_timeout=30,
        retries={"max_attempts": 3, "mode": "standard"},
    )


@lru_cache(maxsize=4)
def _cached_client(endpoint_url, region_name, access_key, secret_key):
    import boto3

    return boto3.session.Session(aws_access_key_id=access_key, aws_secret_access_key=secret_key).client(
        "s3", endpoint_url=endpoint_url, region_name=region_name, config=client_config()
    )


def s3_client():
    """A shared, thread-safe boto3 client for the configured bucket."""
    options = object_storage_options()
    return _cached_client(options["endpoint_url"], options["region_name"], options["access_key"], options["secret_key"])


def _local_storage() -> FileSystemStorage:
    return FileSystemStorage(location=settings.PRIVATE_CONTENT_ROOT)


try:  # django-storages is a production dependency; development can run without it.
    from storages.backends.s3 import S3Storage
except (ImportError, ImproperlyConfigured):  # pragma: no cover - only when the packages are missing
    S3Storage = None


if S3Storage is not None:

    @deconstructible(path="apps.core.storage.PrivateObjectStorage")
    class PrivateObjectStorage(S3Storage):
        """Private bucket storage that can still read files that have not yet been copied off the old disk."""

        default_acl = None
        querystring_auth = True
        file_overwrite = False

        def __init__(self, **overrides):
            options = object_storage_options()
            super().__init__(**{
                "bucket_name": getattr(settings, "MEDIA_STORAGE_BUCKET", ""),
                "location": getattr(settings, "MEDIA_STORAGE_PREFIX", "private").strip("/"),
                "endpoint_url": options["endpoint_url"],
                "region_name": options["region_name"],
                "access_key": options["access_key"],
                "secret_key": options["secret_key"],
                "client_config": client_config(),
                "default_acl": None,
                "file_overwrite": False,
                "max_memory_size": _READ_BUFFER_BYTES,
                **overrides,
            })

        def _fallback(self) -> FileSystemStorage | None:
            if not getattr(settings, "MEDIA_STORAGE_LOCAL_FALLBACK", True):
                return None
            return _local_storage()

        def _open(self, name, mode="rb"):
            try:
                return super()._open(name, mode)
            except FileNotFoundError:
                local = self._fallback()
                if local is not None and "w" not in mode and local.exists(name):
                    return local.open(name, mode)
                raise

        def exists(self, name):
            if super().exists(name):
                return True
            local = self._fallback()
            return bool(local and local.exists(name))

        def size(self, name):
            try:
                return super().size(name)
            except FileNotFoundError:
                local = self._fallback()
                if local is not None and local.exists(name):
                    return local.size(name)
                raise

        def delete(self, name):
            super().delete(name)
            local = self._fallback()
            if local is not None:
                try:
                    local.delete(name)
                except OSError:
                    pass

else:  # pragma: no cover
    PrivateObjectStorage = None


def uses_object_storage() -> bool:
    return getattr(settings, "FILE_STORAGE_BACKEND", "local") == "s3"


def private_storage():
    """The storage for every private upload (model fields pass this callable as ``storage=``)."""
    if uses_object_storage():
        if PrivateObjectStorage is None:
            raise ImproperlyConfigured("FILE_STORAGE_BACKEND=s3 needs the django-storages[s3] package.")
        return PrivateObjectStorage()
    return _local_storage()


def file_version(field) -> str:
    """A short token that changes whenever the stored file changes, for cache-busting URLs."""
    return hashlib.sha1(field.name.encode()).hexdigest()[:10] if field else ""


def versioned_url(url: str, field) -> str:
    return f"{url}?v={file_version(field)}" if field else ""


def missing_file_response() -> JsonResponse:
    return JsonResponse({"error": {
        "code": "FileUnavailable",
        "message": "This file is no longer available. Ask your programme team to upload it again.",
        "retryable": False,
    }}, status=404)


def storage_unavailable_response() -> JsonResponse:
    return JsonResponse({"error": {
        "code": "StorageUnavailable",
        "message": "Files can’t be reached right now. Please try again in a moment.",
        "retryable": True,
    }}, status=503)


def open_stored(field):
    """Open a stored file for reading, or return an error response when it is missing or storage is down."""
    try:
        return field.open("rb"), None
    except FileNotFoundError:
        logger.warning("Stored file missing: %s", field.name)
        return None, missing_file_response()
    except Exception as error:  # botocore network/credential errors must not become a 500 page
        if _is_storage_error(error):
            logger.error("File storage unavailable while opening %s: %s", field.name, error.__class__.__name__)
            return None, storage_unavailable_response()
        raise


def _is_storage_error(error: Exception) -> bool:
    try:
        from botocore.exceptions import BotoCoreError, ClientError
    except ImportError:  # pragma: no cover
        return False
    return isinstance(error, (BotoCoreError, ClientError))


def file_response(field, *, cache_seconds: int = 3600, content_type: str | None = None,
                  as_attachment: bool = False, filename: str | None = None, extra_headers: dict | None = None):
    """Serve a stored file with a sniff-proof content type and a private cache lifetime.

    ``cache_seconds=0`` sends ``no-store`` (documents); images use a lifetime because their URLs carry ``?v=``.
    """
    handle, error = open_stored(field)
    if error is not None:
        return error
    content_type = content_type or mimetypes.guess_type(field.name)[0] or "application/octet-stream"
    response = FileResponse(handle, content_type=content_type, as_attachment=as_attachment, filename=filename or "")
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = f"private, max-age={cache_seconds}" if cache_seconds else "private, no-store"
    for header, value in (extra_headers or {}).items():
        response[header] = value
    return response


def delete_stored_files(names: list[tuple[object, str]]) -> None:
    """Delete stored files after the surrounding transaction commits; failures are logged, never raised.

    ``names`` holds ``(storage, name)`` pairs captured before the database rows changed.
    """
    from django.db import transaction

    pending = [(storage, name) for storage, name in names if name]
    if not pending:
        return

    def _delete():
        for storage, name in pending:
            try:
                storage.delete(name)
            except Exception as error:  # cleanup is best effort: a leftover file is harmless
                logger.warning("Could not delete replaced file %s: %s", name, error.__class__.__name__)

    transaction.on_commit(_delete)
