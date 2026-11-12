"""Private file storage on the persistent disk (PRIVATE_CONTENT_ROOT).

Uploads never go to MEDIA_ROOT: in production that folder is inside the read-only application image, is not
on the persistent disk, and is not served. Files here are served only through authenticated API endpoints.
"""

import mimetypes

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.http import FileResponse


def private_storage():
    return FileSystemStorage(location=settings.PRIVATE_CONTENT_ROOT)


def file_response(field, *, cache_seconds: int = 3600) -> FileResponse:
    """Serve a stored file with a sniff-proof content type and a private cache lifetime."""
    content_type = mimetypes.guess_type(field.name)[0] or "application/octet-stream"
    response = FileResponse(field.open("rb"), content_type=content_type)
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = f"private, max-age={cache_seconds}"
    return response
