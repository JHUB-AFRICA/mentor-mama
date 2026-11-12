"""Deployment checks: warn (never block) when emailed links would not work for real recipients."""

from django.conf import settings
from django.core.checks import Warning as CheckWarning
from django.core.checks import register

from apps.core.links import is_local


@register(deploy=False)
def public_links_check(app_configs, **kwargs):
    if not settings.LINKS_MUST_BE_PUBLIC:
        return []
    found = []
    if is_local(settings.FRONTEND_BASE_URL or ""):
        found.append(CheckWarning(
            "FRONTEND_BASE_URL points at a local address. Invitation and password-reset emails cannot be sent.",
            hint="Set PORTAL_DOMAIN (or FRONTEND_BASE_URL) to the public portal address.", id="core.W001"))
    if is_local(settings.WEBSITE_BASE_URL or ""):
        found.append(CheckWarning(
            "WEBSITE_BASE_URL is not set to the public website, so emails leave out the 'check progress' link.",
            hint="Set WEBSITE_BASE_URL to the public website address, for example https://www.example.org.", id="core.W002"))
    return found
