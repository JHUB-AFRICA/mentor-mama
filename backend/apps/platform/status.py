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


def _storage():
    root = getattr(settings, "PRIVATE_CONTENT_ROOT", "")
    writable = bool(root) and os.path.isdir(root) and os.access(root, os.W_OK)
    exports = getattr(settings, "EXPORT_STORAGE_BACKEND", "local")
    detail = f"Uploads {'writable' if writable else 'not writable'} · exports in {'object storage' if exports == 's3' else 'local folder'}"
    if exports == "s3" and not getattr(settings, "EXPORT_STORAGE_BUCKET", ""):
        return "down", detail + " · export bucket not configured"
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
