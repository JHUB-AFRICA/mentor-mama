"""Base Django settings for MentorMAMA backend."""

from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

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
    "apps.platform",
]

MIDDLEWARE = [
    "apps.core.middleware.LivenessProbeMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "apps.core.middleware.SafeApiErrorResponseMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "allauth.account.middleware.AccountMiddleware",
    "apps.core.consent_gate.ConsentGateMiddleware",
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
AI_ENABLED = env.bool("AI_ENABLED", default=False)
# OpenAI for the MVP. Any OpenAI-compatible server (vLLM, Ollama) works by changing
# the base URL, model, and key; see docs/architecture/ai-integration-plan.md.
AI_API_BASE_URL = env("AI_API_BASE_URL", default="https://api.openai.com/v1")
AI_API_KEY = env("AI_API_KEY", default="")
AI_MODEL = env("AI_MODEL", default="gpt-4o-mini")
AI_TIMEOUT_SECONDS = env.int("AI_TIMEOUT_SECONDS", default=20)
AI_MAX_OUTPUT_TOKENS = env.int("AI_MAX_OUTPUT_TOKENS", default=500)
# Leave empty for reasoning models (gpt-5*, o-series) that reject temperature.
_ai_temperature = env("AI_TEMPERATURE", default="0.2").strip()
AI_TEMPERATURE = float(_ai_temperature) if _ai_temperature else None
# Transactional email. Production sends through Resend (domain sinapstechnology.tech, Resend Forge).
# EMAIL_PROVIDER: "resend" | "mailtrap" (QA sandbox) | "console" (print to the log; the safe default).
# USE_MAILTRAP=true is still honoured so existing environments keep working.
RESEND_API_KEY = env("RESEND_API_KEY", default="")
# Svix signing secret ("whsec_...") of the Resend webhook that posts to /anymail/resend/tracking/.
RESEND_SIGNING_SECRET = env("RESEND_SIGNING_SECRET", default="")
USE_MAILTRAP = env.bool("USE_MAILTRAP", default=False)
EMAIL_PROVIDER = env("EMAIL_PROVIDER", default="mailtrap" if USE_MAILTRAP else "console").strip().lower()
_EMAIL_BACKENDS = {
    "resend": "anymail.backends.resend.EmailBackend",
    "mailtrap": "anymail.backends.mailtrap.EmailBackend",
    "console": "django.core.mail.backends.console.EmailBackend",
}
if EMAIL_PROVIDER not in _EMAIL_BACKENDS:
    raise ImproperlyConfigured(f"EMAIL_PROVIDER must be one of {sorted(_EMAIL_BACKENDS)}, not {EMAIL_PROVIDER!r}.")
if EMAIL_PROVIDER == "resend" and not RESEND_API_KEY:
    raise ImproperlyConfigured("EMAIL_PROVIDER=resend needs RESEND_API_KEY.")
# Every message goes through the safety wrapper, which drops mail to reserved ".test" addresses and, for people in the
# demo programme, to anyone not on DEMO_EMAIL_ALLOWLIST. It then hands the message to the real provider below.
EMAIL_DELEGATE_BACKEND = env("EMAIL_BACKEND", default=_EMAIL_BACKENDS[EMAIL_PROVIDER])
EMAIL_BACKEND = "apps.core.email_backend.SafeEmailBackend"
# Presentation mode: one-tap sign-in for the demo programme's accounts, without MFA. OFF unless explicitly enabled;
# turn it off again after the presentation. Real programmes are never affected.
DEMO_MODE = env.bool("DEMO_MODE", default=False)
# Seeded demo people get addresses on this subdomain of our own domain. Mail to it is always dropped (no mailbox exists).
DEMO_EMAIL_DOMAIN = env("DEMO_EMAIL_DOMAIN", default="demo.sinapstechnology.tech").strip().lower()
# Real inboxes the demo programme may email (comma-separated). "name+tag@gmail.com" counts as "name@gmail.com".
DEMO_EMAIL_ALLOWLIST = [address.strip().lower() for address in env.list("DEMO_EMAIL_ALLOWLIST", default=[]) if address.strip()]
ANYMAIL = {
    "RESEND_API_KEY": RESEND_API_KEY,
    **({"RESEND_SIGNING_SECRET": RESEND_SIGNING_SECRET} if RESEND_SIGNING_SECRET else {}),
    "MAILTRAP_API_TOKEN": MAILTRAP_API_TOKEN,
    # Setting this selects Sandbox; leaving it empty selects production API.
    "MAILTRAP_SANDBOX_ID": MAILTRAP_SANDBOX_ID or None,
}
# One sender for every part of the product: portal sign-in codes, invitations, notifications and exports.
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="MentorMAMA <mentormama@sinapstechnology.tech>")
SERVER_EMAIL = env("SERVER_EMAIL", default=DEFAULT_FROM_EMAIL)
OTP_EMAIL_SENDER = env("OTP_EMAIL_SENDER", default=DEFAULT_FROM_EMAIL)
OTP_EMAIL_TOKEN_VALIDITY = env.int("OTP_EMAIL_TOKEN_VALIDITY", default=300)
OTP_EMAIL_COOLDOWN_DURATION = env.int("OTP_EMAIL_COOLDOWN_DURATION", default=60)
OTP_EMAIL_THROTTLE_FACTOR = env.int("OTP_EMAIL_THROTTLE_FACTOR", default=1)
FRONTEND_BASE_URL = env("FRONTEND_BASE_URL", default="http://localhost:5173")
# Website enquiries and support requests: who is alerted (default: every active platform administrator) and the
# address senders can reply to from the emails they receive (empty = they reply to the sender address).
PLATFORM_NOTIFY_EMAILS = env.list("PLATFORM_NOTIFY_EMAILS", default=[])
SUPPORT_REPLY_TO = env("SUPPORT_REPLY_TO", default="").strip()
# Public website address (used for the progress-check link in enquiry emails).
WEBSITE_BASE_URL = env("WEBSITE_BASE_URL", default="http://localhost:5173")
# Production sets this True (config/settings/prod.py): emails must never carry a link to a local address.
LINKS_MUST_BE_PUBLIC = False
# Shared secret for the inbound-reply endpoint (empty = endpoint closed) and optional Cloudflare Turnstile on the public forms.
ENQUIRY_INBOUND_SECRET = env("ENQUIRY_INBOUND_SECRET", default="")
TURNSTILE_SECRET_KEY = env("TURNSTILE_SECRET_KEY", default="")
ENQUIRY_RETENTION_SPAM_DAYS = env.int("ENQUIRY_RETENTION_SPAM_DAYS", default=30)
ENQUIRY_RETENTION_CLOSED_DAYS = env.int("ENQUIRY_RETENTION_CLOSED_DAYS", default=730)
EXPORT_ROOT = env("EXPORT_ROOT", default="/tmp/mentormama-exports")
# "r2" = Cloudflare R2 (the production store). "s3" is accepted as an alias: R2 speaks the S3 API, so any
# S3-compatible bucket works with the same code. Both are normalised to "r2" below.
_OBJECT_STORAGE_ALIASES = {"r2": "r2", "s3": "r2", "local": "local"}
EXPORT_STORAGE_BACKEND = _OBJECT_STORAGE_ALIASES.get(env("EXPORT_STORAGE_BACKEND", default="local").strip().lower(), "invalid")
if EXPORT_STORAGE_BACKEND == "invalid":
    raise ImproperlyConfigured("EXPORT_STORAGE_BACKEND must be 'r2' (Cloudflare R2) or 'local'.")
EXPORT_STORAGE_BUCKET = env("EXPORT_STORAGE_BUCKET", default="")
EXPORT_STORAGE_ENDPOINT = env("EXPORT_STORAGE_ENDPOINT", default="")
EXPORT_STORAGE_REGION = env("EXPORT_STORAGE_REGION", default="")
# Exports share the bucket with uploads, under their own prefix.
EXPORT_STORAGE_PREFIX = env("EXPORT_STORAGE_PREFIX", default="exports").strip("/")

# Private uploads (documents, covers, lesson images, logos). "r2" stores them in Cloudflare R2; "local" keeps them in PRIVATE_CONTENT_ROOT. The bucket, endpoint and region default to the export ones,
# so one R2 bucket and one API token serve the whole product. Credentials: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
FILE_STORAGE_BACKEND = _OBJECT_STORAGE_ALIASES.get(env("FILE_STORAGE_BACKEND", default="local").strip().lower(), "invalid")
MEDIA_STORAGE_BUCKET = env("MEDIA_STORAGE_BUCKET", default=EXPORT_STORAGE_BUCKET)
MEDIA_STORAGE_ENDPOINT = env("MEDIA_STORAGE_ENDPOINT", default=EXPORT_STORAGE_ENDPOINT)
MEDIA_STORAGE_REGION = env("MEDIA_STORAGE_REGION", default=EXPORT_STORAGE_REGION or "auto")
MEDIA_STORAGE_PREFIX = env("MEDIA_STORAGE_PREFIX", default="private").strip("/")
# While files are moved off the old persistent disk, files not yet in the bucket are read from PRIVATE_CONTENT_ROOT.
MEDIA_STORAGE_LOCAL_FALLBACK = env.bool("MEDIA_STORAGE_LOCAL_FALLBACK", default=True)
OBJECT_STORAGE_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID", default="")
OBJECT_STORAGE_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY", default="")
if FILE_STORAGE_BACKEND == "invalid":
    raise ImproperlyConfigured("FILE_STORAGE_BACKEND must be 'r2' (Cloudflare R2) or 'local'.")
if FILE_STORAGE_BACKEND == "r2" and not MEDIA_STORAGE_BUCKET:
    raise ImproperlyConfigured("FILE_STORAGE_BACKEND=r2 needs MEDIA_STORAGE_BUCKET (or EXPORT_STORAGE_BUCKET).")

# Form fields (not files) above this size are refused with a clear 413 instead of a server error.
DATA_UPLOAD_MAX_MEMORY_SIZE = env.int("DATA_UPLOAD_MAX_MEMORY_SIZE", default=10 * 1024 * 1024)
# Uploaded files above this size are spooled to a temporary file rather than held in memory.
FILE_UPLOAD_MAX_MEMORY_SIZE = env.int("FILE_UPLOAD_MAX_MEMORY_SIZE", default=5 * 1024 * 1024)

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
# Accept the previous and next 30-second code as well as the current one (RFC 6238 §5.2). With the allauth
# default of 0, a code is valid only while it is the exact current one, so a few seconds of phone/server
# clock difference or a slow typist was enough to be rejected.
MFA_TOTP_TOLERANCE = env.int("MFA_TOTP_TOLERANCE", default=1)

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
        # Public website forms: per visitor address, and a ceiling across everyone so a flood cannot fill the inbox.
        "public_enquiry": "10/hour",
        "public_enquiry_global": "400/hour",
        "public_enquiry_status": "30/hour",
        "auth_demo": "60/hour",
        # Formal data requests (correct / show / delete my data): per signed-in person.
        "privacy_request": "10/hour",
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "MentorMAMA API",
    "DESCRIPTION": "API schema for the MentorMAMA platform.",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}
