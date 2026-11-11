"""Parse pasted video links into a provider + id; only YouTube and Vimeo are accepted."""

import re
from urllib.parse import parse_qs, urlparse

_YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
_VIMEO_ID = re.compile(r"^\d{5,12}$")
_YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"}


def parse_video_url(url: str) -> dict | None:
    """Return {"provider", "id", "embed_url"} or None when the link is not a supported video."""
    try:
        parsed = urlparse((url or "").strip())
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    host = parsed.hostname.lower()
    parts = [p for p in parsed.path.split("/") if p]
    video_id = None
    if host == "youtu.be" and parts:
        video_id = parts[0]
    elif host in _YOUTUBE_HOSTS:
        if parsed.path == "/watch":
            video_id = (parse_qs(parsed.query).get("v") or [""])[0]
        elif len(parts) == 2 and parts[0] in {"embed", "shorts", "live", "v"}:
            video_id = parts[1]
    if video_id and _YOUTUBE_ID.match(video_id):
        return {"provider": "youtube", "id": video_id,
                "embed_url": f"https://www.youtube-nocookie.com/embed/{video_id}?rel=0&modestbranding=1&playsinline=1"}
    if host in {"vimeo.com", "www.vimeo.com", "player.vimeo.com"}:
        candidate = parts[-1] if parts else ""
        if host == "player.vimeo.com":
            candidate = parts[1] if len(parts) == 2 and parts[0] == "video" else ""
        if _VIMEO_ID.match(candidate):
            return {"provider": "vimeo", "id": candidate, "embed_url": f"https://player.vimeo.com/video/{candidate}?dnt=1"}
    return None
