from PIL import Image, UnidentifiedImageError
from django.core.exceptions import ValidationError


MAX_PARTNER_LOGO_BYTES = 2 * 1024 * 1024
MAX_PARTNER_LOGO_DIMENSION = 4096
ALLOWED_PARTNER_LOGO_FORMATS = {"JPEG", "PNG", "WEBP"}


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
