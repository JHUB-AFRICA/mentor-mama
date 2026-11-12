from PIL import Image, UnidentifiedImageError
from django.core.exceptions import ValidationError


MAX_PARTNER_LOGO_BYTES = 2 * 1024 * 1024
MAX_PARTNER_LOGO_DIMENSION = 4096
ALLOWED_PARTNER_LOGO_FORMATS = {"JPEG", "PNG", "WEBP"}

MAX_COVER_BYTES = 2 * 1024 * 1024
COVER_FORMATS = {"JPEG", "PNG", "WEBP"}
FORMAT_LABELS = {"JPEG": "JPG", "PNG": "PNG", "WEBP": "WebP", "GIF": "GIF"}
IMAGE_CONTENT_TYPES = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp", "GIF": "image/gif"}
#: Pixel area above which an image is refused (decompression bombs, needlessly huge photos).
MAX_IMAGE_PIXELS = 40_000_000


def _format_list(formats) -> str:
    names = [FORMAT_LABELS.get(name, name) for name in sorted(formats)]
    return ", ".join(names[:-1]) + f" or {names[-1]}" if len(names) > 1 else names[0]


def inspect_image(upload, *, formats=COVER_FORMATS, max_bytes=MAX_COVER_BYTES, max_dimension=None):
    """Check that an upload really is an image (not just named like one) and return ``(format, width, height)``.

    The browser's content type is not trusted: the file is decoded and verified with Pillow.
    """
    if upload.size > max_bytes:
        raise ValidationError(f"Choose an image smaller than {max_bytes // (1024 * 1024)} MB.")
    allowed = _format_list(formats)
    try:
        upload.seek(0)
        with Image.open(upload) as image:
            kind, (width, height) = (image.format or "").upper(), image.size
            image.verify()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError, SyntaxError):
        raise ValidationError(f"That file is not a readable image. Use a {allowed} file.")
    finally:
        upload.seek(0)
    if kind not in formats:
        raise ValidationError(f"Use a {allowed} image.")
    if width * height > MAX_IMAGE_PIXELS or (max_dimension and (width > max_dimension or height > max_dimension)):
        limit = f"{max_dimension} pixels" if max_dimension else "a smaller size"
        raise ValidationError(f"This image is too large. Resize it to {limit} or less and try again.")
    return kind, width, height


def validate_cover_image(upload):
    inspect_image(upload, formats=COVER_FORMATS, max_bytes=MAX_COVER_BYTES)


def validate_partner_logo(upload):
    if upload.size > MAX_PARTNER_LOGO_BYTES:
        raise ValidationError("Logo must be 2 MB or smaller.")
    try:
        upload.seek(0)
        with Image.open(upload) as image:
            if image.format not in ALLOWED_PARTNER_LOGO_FORMATS:
                raise ValidationError("Use a PNG, JPEG, or WebP logo.")
            if image.width > MAX_PARTNER_LOGO_DIMENSION or image.height > MAX_PARTNER_LOGO_DIMENSION:
                raise ValidationError("Logo dimensions must be 4096 pixels or smaller.")
            image.verify()
        upload.seek(0)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        raise ValidationError("Upload a valid PNG, JPEG, or WebP image.")
    finally:
        upload.seek(0)
