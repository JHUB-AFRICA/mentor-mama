import pytest

from apps.learning.video import parse_video_url

VECTORS = [
    ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "dQw4w9WgXcQ"),
    ("https://youtu.be/dQw4w9WgXcQ?t=5", "youtube", "dQw4w9WgXcQ"),
    ("https://m.youtube.com/shorts/dQw4w9WgXcQ", "youtube", "dQw4w9WgXcQ"),
    ("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "youtube", "dQw4w9WgXcQ"),
    ("https://vimeo.com/123456789", "vimeo", "123456789"),
    ("https://player.vimeo.com/video/123456789", "vimeo", "123456789"),
]


@pytest.mark.parametrize("url,provider,video_id", VECTORS)
def test_supported_links(url, provider, video_id):
    parsed = parse_video_url(url)
    assert parsed["provider"] == provider and parsed["id"] == video_id


@pytest.mark.parametrize("url", [
    "", "javascript:alert(1)", "https://evil.example/watch?v=dQw4w9WgXcQ", "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short", "https://vimeo.com/abc", "ftp://youtu.be/dQw4w9WgXcQ",
])
def test_rejected_links(url):
    assert parse_video_url(url) is None
