"""System status for the platform dashboard: each check is cheap, bounded and never raises."""

from __future__ import annotations

import os
import time
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.utils import timezone

#: The scheduler sends the outbox dispatch task every 10 seconds; the worker records each run here.
DISPATCH_HEARTBEAT_KEY = "platform:outbox-dispatch-heartbeat"


def record_dispatch_heartbeat() -> None:
    cache.set(DISPATCH_HEARTBEAT_KEY, timezone.now().isoformat(), timeout=24 * 3600)


def _check(name, func):
    started = time.monotonic()
    try:
        state, detail = func()
    except Exception as error:  # a status page must never crash because a dependency is down
        state, detail = "down", error.__class__.__name__
    return {"name": name, "state": state, "detail": detail, "ms": round((time.monotonic() - started) * 1000)}


def _database():
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    return "ok", connection.vendor


def _cache():
    if not getattr(settings, "USE_REDIS", False):
        return "warning", "Local memory cache (not shared between services)"
    cache.set("platform:status-probe", "1", timeout=30)
    return ("ok", "Redis") if cache.get("platform:status-probe") == "1" else ("down", "Cache did not return the probe")


def _background_jobs():
    from apps.core.models import OutboxEvent

    now = timezone.now()
    pending = OutboxEvent.objects.filter(dispatched_at=None, dead_at=None)
    oldest = pending.order_by("occurred_at").values_list("occurred_at", flat=True).first()
    count = pending.count()
    heartbeat = cache.get(DISPATCH_HEARTBEAT_KEY)
    last_run = None
    if heartbeat:
        from django.utils.dateparse import parse_datetime

        last_run = parse_datetime(heartbeat)
    if last_run is None:
        return ("warning" if count == 0 else "down"), "No background run recorded yet" + (f" · {count} waiting" if count else "")
    age = (now - last_run).total_seconds()
    backlog = (now - oldest).total_seconds() if oldest else 0
    detail = f"Last run {int(age)}s ago · {count} waiting"
    if age > 300 or backlog > 600:
        return "down", detail
    if age > 60 or backlog > 120:
        return "warning", detail
    return "ok", detail


def _email():
    provider = getattr(settings, "EMAIL_PROVIDER", "console")
    if provider == "console":
        return "warning", "Console only: emails are written to the log, not sent"
    from apps.core.models import OutboxEvent

    dead = OutboxEvent.objects.filter(dead_at__gte=timezone.now() - timedelta(days=7)).count()
    detail = f"{provider.title()} · from {settings.DEFAULT_FROM_EMAIL}"
    if provider == "resend" and not getattr(settings, "RESEND_SIGNING_SECRET", ""):
        detail += " · delivery tracking not connected"
    if dead:
        return "warning", f"{detail} · {dead} message(s) gave up in the last 7 days"
    return "ok", detail


def _bucket_reachable(bucket: str) -> tuple[bool, str]:
    """One HEAD request against the bucket, remembered for a minute so the dashboard never hammers R2."""
    cache_key = f"platform:bucket-probe:{bucket}"
    remembered = cache.get(cache_key)
    if remembered is not None:
        return tuple(remembered)
    from botocore.exceptions import BotoCoreError, ClientError

    from apps.core.storage import s3_client

    try:
        s3_client().head_bucket(Bucket=bucket)
        result = (True, "reachable")
    except ClientError as error:
        code = str(error.response.get("Error", {}).get("Code", ""))
        reasons = {"403": "access denied: check the API token", "AccessDenied": "access denied: check the API token",
                   "404": "bucket not found", "NoSuchBucket": "bucket not found",
                   "InvalidAccessKeyId": "unknown access key", "SignatureDoesNotMatch": "secret key does not match"}
        result = (False, reasons.get(code, f"error {code or 'unknown'}"))
    except BotoCoreError as error:
        name = error.__class__.__name__
        result = (False, "no credentials: set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY" if "Credentials" in name
                  else "cannot connect: check MEDIA_STORAGE_ENDPOINT / EXPORT_STORAGE_ENDPOINT")
    cache.set(cache_key, list(result), timeout=60)
    return result


def _storage():
    from apps.core.storage import uses_object_storage

    exports = getattr(settings, "EXPORT_STORAGE_BACKEND", "local")
    export_label = "exports in object storage" if exports == "s3" else "exports in a local folder"
    if uses_object_storage():
        bucket = getattr(settings, "MEDIA_STORAGE_BUCKET", "")
        ok, reason = _bucket_reachable(bucket)
        detail = f"Uploads in object storage ({bucket}) · {reason} · {export_label}"
        return ("ok" if ok else "down"), detail
    root = getattr(settings, "PRIVATE_CONTENT_ROOT", "")
    writable = bool(root) and os.path.isdir(root) and os.access(root, os.W_OK)
    detail = f"Uploads on the server disk ({'writable' if writable else 'not writable'}) · {export_label}"
    if exports == "s3":
        if not getattr(settings, "EXPORT_STORAGE_BUCKET", ""):
            return "down", detail + " · export bucket not configured"
        ok, reason = _bucket_reachable(settings.EXPORT_STORAGE_BUCKET)
        if not ok:
            return "down", f"{detail} · bucket {reason}"
    if not settings.DEBUG:
        # Production files on a server disk are lost if the disk is removed and cannot be shared between services.
        return ("warning" if writable else "down"), detail + " · switch uploads to object storage (FILE_STORAGE_BACKEND=s3)"
    return ("ok" if writable else "warning"), detail


def _ai():
    from apps.core.ai import is_configured

    return ("ok", "Enabled") if is_configured() else ("off", "Switched off")


def system_status() -> dict:
    checks = [
        _check("Database", _database),
        _check("Cache", _cache),
        _check("Background jobs", _background_jobs),
        _check("Email", _email),
        _check("File storage", _storage),
        _check("AI assistant", _ai),
    ]
    overall = "down" if any(c["state"] == "down" for c in checks) else "warning" if any(c["state"] == "warning" for c in checks) else "ok"
    return {
        "overall": overall,
        "checks": checks,
        "release": os.environ.get("RENDER_GIT_COMMIT", "")[:7] or os.environ.get("RELEASE_VERSION", "") or "local",
        "environment": "production" if not settings.DEBUG else "development",
        "checked_at": timezone.now(),
    }
