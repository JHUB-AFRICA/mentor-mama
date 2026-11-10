"""Test settings. PostgreSQL, per ADR 0009 — never SQLite."""

from .base import *  # noqa: F403

DEBUG = False

SECRET_KEY = "test-secret-key-not-for-production"

ALLOWED_HOSTS = ["*"]

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
USE_MAILTRAP = False
USE_REDIS = False
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "mentor-mama-test-cache",
    }
}

# Tests must never reach a real AI provider or use a developer's key from .env.
AI_ENABLED = False
AI_API_KEY = ""
