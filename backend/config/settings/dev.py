"""Development Django settings for MentorMAMA backend."""

from .base import *

DEBUG = True

ALLOWED_HOSTS = ["*"]

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:5175", "http://127.0.0.1:5175",
    "http://localhost:5174", "http://127.0.0.1:5174",
]

CORS_ALLOW_ALL_ORIGINS = True

# Local development must never consume the Mailtrap sandbox quota. The
# transactional outbox and worker still run normally; Django prints the
# rendered message to the API/worker console instead.
USE_MAILTRAP = False
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
