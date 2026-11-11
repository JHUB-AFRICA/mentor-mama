"""Branded PDF rendering for every MentorMAMA document (docs/ux/document-design-system.md).

Documents are Django templates rendered to PDF by WeasyPrint. The renderer is deliberately closed: it can read only the
bundled assets (fonts, master logo files) and ``data:`` URLs, so a template can never reach the network or the
filesystem, whatever data ends up in it. Values are escaped by Django template autoescaping.
"""

from __future__ import annotations

import base64
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from django.template.loader import render_to_string
from django.utils import timezone

ASSETS = (Path(__file__).resolve().parent / "assets").resolve()
#: Programme timezone used for every "Generated …" stamp (the pilot runs in Kenya).
DOCUMENT_TZ = ZoneInfo("Africa/Nairobi")
NAVY = "#0D1B33"


class BlockedResource(Exception):
    """A template tried to load something other than a bundled asset."""


def _fetcher():
    from weasyprint.urls import URLFetcher

    class AssetsOnlyFetcher(URLFetcher):
        def fetch(self, url, headers=None):  # noqa: D401 - WeasyPrint API
            if url.startswith("data:"):
                return super().fetch(url, headers)
            if url.startswith("file://"):
                from urllib.parse import unquote, urlsplit

                parts = urlsplit(url)
                path = Path(unquote(parts.path)).resolve()
                if path.is_relative_to(ASSETS) and path.is_file():
                    return super().fetch(url, headers)
            raise BlockedResource(f"Blocked document resource: {url[:80]}")

    return AssetsOnlyFetcher()


@lru_cache(maxsize=None)
def logo_data_uri(name: str, colour: str | None = None) -> str:
    """A master logo file as a data URI. `colour` fills `currentColor` (the mono lockups) with a palette colour."""
    svg = (ASSETS / "brand" / name).read_text(encoding="utf-8")
    if colour:
        svg = svg.replace("currentColor", colour)
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode("utf-8")).decode("ascii")


def generated_stamp(moment: datetime | None = None) -> str:
    moment = timezone.localtime(moment or timezone.now(), DOCUMENT_TZ)
    return f"{moment:%d %b %Y, %H:%M} {moment.tzname()}"


def render_pdf(template: str, context: dict, *, title: str, subject: str = "", orientation: str = "landscape") -> bytes:
    """Render a document template (which extends ``documents/base.html``) to PDF bytes."""
    from weasyprint import HTML
    from weasyprint.text.fonts import FontConfiguration

    page = {
        "title": title,
        "subject": subject or title,
        "orientation": orientation,
        "generated": generated_stamp(),
        "logo": logo_data_uri("logo-horizontal-accent.svg"),
        "watermark": logo_data_uri("logo-horizontal-mono.svg", NAVY),
        "assets": ASSETS.as_uri(),
    }
    html = render_to_string(template, {**context, "page": page})
    fonts = FontConfiguration()
    try:
        document = HTML(string=html, base_url=ASSETS.as_uri() + "/", url_fetcher=_fetcher())
        return document.write_pdf(font_config=fonts)
    finally:
        # The temp font folder is otherwise only removed when the object is garbage collected; /tmp is small in prod.
        folder = getattr(fonts, "_folder", None)
        if folder:
            import shutil

            shutil.rmtree(folder, ignore_errors=True)
