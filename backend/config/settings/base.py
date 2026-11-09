"""Base Django settings for MentorMAMA backend."""

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, []),
    CSRF_TRUSTED_ORIGINS=(list, []),
    CORS_ALLOWED_ORIGINS=(list, []),
)

# Read .env file if it exists
environ.Env.read_env(BASE_DIR.parent / ".env")

SECRET_KEY = env("SECRET_KEY", default="change-me-in-production")

DEBUG = env("DEBUG")

ALLOWED_HOSTS = env("ALLOWED_HOSTS")

CSRF_TRUSTED_ORIGINS = env("CSRF_TRUSTED_ORIGINS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "anymail",
    "allauth",
    "allauth.account",
    "allauth.mfa",
    "django_otp",
    "django_otp.plugins.otp_email",
    "corsheaders",
    # Layer 0 — platform
    "apps.core",
    "apps.identity",
    # Layer 1 — organisational and capability
    "apps.institutions",
    "apps.facilities",
    "apps.learning",
    "apps.content",
    # Layer 2 — core domain
    "apps.placements",
    # Layer 4 — application orchestration across directory domains
    "apps.directory_imports",
    # Layer 3 — placement-bound children
    "apps.induction",
    "apps.mentorship",
    "apps.assessments",
    "apps.safeguarding",
    # Layer 5 — read side and leaves
    "apps.analytics",
    "apps.notifications",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "apps.core.middleware.SafeApiErrorResponseMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "allauth.account.middleware.AccountMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

PROMETHEUS_METRICS_ENABLED = env.bool("PROMETHEUS_METRICS_ENABLED", default=False)
if PROMETHEUS_METRICS_ENABLED:
    INSTALLED_APPS += ["django_prometheus"]
    MIDDLEWARE = [
        "django_prometheus.middleware.PrometheusBeforeMiddleware",
        *MIDDLEWARE,
        "django_prometheus.middleware.PrometheusAfterMiddleware",
    ]

ROOT_URLCONF = "config.urls"
CSRF_FAILURE_VIEW = "apps.core.views.csrf_failure"

WSGI_APPLICATION = "config.wsgi.application"

ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# PostgreSQL in every environment, including local dev and tests (ADR 0009):
# SQLite cannot express our partial indexes, EXCLUDE constraints or triggers, so
# a green SQLite run would prove nothing.
DATABASES = {
    "default": env.db(
        var="DATABASE_URL",
        default="postgres://mentormama:mentormama@localhost:5433/mentormama",
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-gb"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
PRIVATE_CONTENT_ROOT = Path(env("PRIVATE_CONTENT_ROOT", default=str(BASE_DIR / "private_content")))

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

DEFAULT_CHARSET = "utf-8"

MAILTRAP_API_TOKEN = env("MAILTRAP_API_TOKEN", default="")
MAILTRAP_SANDBOX_ID = env("MAILTRAP_SANDBOX_ID", default="")
MAILTRAP_WEBHOOK_SECRET = env("MAILTRAP_WEBHOOK_SECRET", default="")
USE_MAILTRAP = env("USE_MAILTRAP", default=False)
EMAIL_BACKEND = (
    "anymail.backends.mailtrap.EmailBackend"
    if USE_MAILTRAP
    else env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
)
ANYMAIL = {
    "MAILTRAP_API_TOKEN": MAILTRAP_API_TOKEN,
    # Setting this selects Sandbox; leaving it empty selects production API.
    "MAILTRAP_SANDBOX_ID": MAILTRAP_SANDBOX_ID or None,
}
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="accounts@localhost")
OTP_EMAIL_SENDER = env("OTP_EMAIL_SENDER", default=DEFAULT_FROM_EMAIL)
OTP_EMAIL_TOKEN_VALIDITY = env.int("OTP_EMAIL_TOKEN_VALIDITY", default=300)
OTP_EMAIL_COOLDOWN_DURATION = env.int("OTP_EMAIL_COOLDOWN_DURATION", default=60)
OTP_EMAIL_THROTTLE_FACTOR = env.int("OTP_EMAIL_THROTTLE_FACTOR", default=1)
FRONTEND_BASE_URL = env("FRONTEND_BASE_URL", default="http://localhost:5173")
EXPORT_ROOT = env("EXPORT_ROOT", default="/tmp/mentormama-exports")
EXPORT_STORAGE_BACKEND = env("EXPORT_STORAGE_BACKEND", default="local")
EXPORT_STORAGE_BUCKET = env("EXPORT_STORAGE_BUCKET", default="")
EXPORT_STORAGE_ENDPOINT = env("EXPORT_STORAGE_ENDPOINT", default="")
EXPORT_STORAGE_REGION = env("EXPORT_STORAGE_REGION", default="")

REDIS_URL = env("REDIS_URL", default="redis://127.0.0.1:6379/0")
USE_REDIS = env.bool("USE_REDIS", default=True)
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default=REDIS_URL)
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default=CELERY_BROKER_URL)
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 60
CELERY_RESULT_EXPIRES = env.int("CELERY_RESULT_EXPIRES", default=3600)
CACHES = {
    "default": {
        "BACKEND": (
            "django.core.cache.backends.redis.RedisCache"
            if USE_REDIS else "django.core.cache.backends.locmem.LocMemCache"
        ),
        "LOCATION": REDIS_URL if USE_REDIS else "mentor-mama-local-cache",
    }
}
AUTH_INVITATION_MAX_AGE = env("AUTH_INVITATION_MAX_AGE", default=172800)
AUTH_PASSWORD_RESET_MAX_AGE = env("AUTH_PASSWORD_RESET_MAX_AGE", default=3600)
PASSWORD_RESET_TIMEOUT = AUTH_PASSWORD_RESET_MAX_AGE

AUTH_USER_MODEL = "identity.User"
AUTHENTICATION_BACKENDS = ["apps.identity.backends.StatusModelBackend"]

# django-allauth MFA supplies TOTP and recovery-code primitives. Account
# creation and login remain owned by identity services; allauth is not used as
# a second user/account system.
ACCOUNT_USER_MODEL_USERNAME_FIELD = None
ACCOUNT_USER_MODEL_EMAIL_FIELD = "email"
ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*", "password2*"]
MFA_SUPPORTED_TYPES = ["totp", "recovery_codes"]
MFA_TOTP_ISSUER = env("MFA_TOTP_ISSUER", default="MentorMAMA")

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # Domain errors and constraint violations are translated here (DB-01, ERR-01).
    "EXCEPTION_HANDLER": "apps.core.http.domain_exception_handler",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.identity.authentication.MFAEnforcedSessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_RATES": {
        # These public/pending-session routes bypass allauth's browser flow,
        # so keep equivalent attempt limits at the DRF boundary.
        "auth_login": "20/hour",
        "auth_activate": "10/hour",
        "auth_mfa": "10/minute",
        "auth_mfa_setup": "5/hour",
        "auth_email_challenge": "3/hour",
        "auth_email_verify": "10/minute",
        "auth_password_reset": "5/hour",
        "auth_password_reset_confirm": "10/hour",
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "MentorMAMA API",
    "DESCRIPTION": "API schema for the MentorMAMA platform.",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}
