"""Absolute links that go into emails.

A link to ``localhost`` in a real email is useless to the person who receives it and looks careless, so in production
(``LINKS_MUST_BE_PUBLIC``) we refuse to build one:

* ``portal_url`` is needed for sign-in links (invitations, password reset). It raises, so the email is retried and the
  problem shows up in the system status instead of a broken link being sent.
* ``website_url`` is for optional pointers to the public website. It returns ``None`` and the caller leaves the line out.
"""

from __future__ import annotations

from urllib.parse import urlsplit

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"}


def is_local(base: str) -> bool:
    """True for an empty value, a loopback/private development address or a ``*.local`` / ``*.localhost`` host."""
    host = (urlsplit(base if "//" in base else f"//{base}").hostname or "").lower()
    return not host or host in LOCAL_HOSTS or host.endswith((".local", ".localhost")) or host.startswith(("192.168.", "10."))


def _join(base: str, path: str) -> str:
    return base.rstrip("/") + ("/" + path.lstrip("/") if path else "")


def portal_url(path: str = "") -> str:
    base = (settings.FRONTEND_BASE_URL or "").strip()
    if settings.LINKS_MUST_BE_PUBLIC and is_local(base):
        raise ImproperlyConfigured(
            "FRONTEND_BASE_URL (or PORTAL_DOMAIN) does not point at the public portal, so sign-in links cannot be emailed."
        )
    return _join(base, path)


def website_url(path: str = "") -> str | None:
    base = (settings.WEBSITE_BASE_URL or "").strip()
    if not base or (settings.LINKS_MUST_BE_PUBLIC and is_local(base)):
        return None
    return _join(base, path)
