"""Test Django settings for MentorMAMA backend."""

from .base import *

DEBUG = True

SECRET_KEY = "test-secret-key-not-for-production"

ALLOWED_HOSTS = ["*"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]
