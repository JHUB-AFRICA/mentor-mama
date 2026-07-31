"""Test settings. PostgreSQL, per ADR 0009 — never SQLite."""

from .base import *  # noqa: F403

DEBUG = False

SECRET_KEY = "test-secret-key-not-for-production"

ALLOWED_HOSTS = ["*"]

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
