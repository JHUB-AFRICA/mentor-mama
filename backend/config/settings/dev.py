"""Development Django settings for MentorMAMA backend."""

from .base import *

DEBUG = True

ALLOWED_HOSTS = ["*"]

CSRF_TRUSTED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]

CORS_ALLOW_ALL_ORIGINS = True
