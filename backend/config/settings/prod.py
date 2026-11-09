"""Production Django settings for MentorMAMA backend."""

from .base import *

DEBUG = False

SECRET_KEY = env("SECRET_KEY")

ALLOWED_HOSTS = env("ALLOWED_HOSTS")

CSRF_TRUSTED_ORIGINS = env("CSRF_TRUSTED_ORIGINS")

DATABASES = {
    "default": env.db("DATABASE_URL"),
}

CORS_ALLOWED_ORIGINS = env("CSRF_TRUSTED_ORIGINS")

PROMETHEUS_METRICS_ENABLED = env.bool("PROMETHEUS_METRICS_ENABLED", default=True)
if PROMETHEUS_METRICS_ENABLED and "django_prometheus" not in INSTALLED_APPS:
    INSTALLED_APPS += ["django_prometheus"]
    MIDDLEWARE = [
        "django_prometheus.middleware.PrometheusBeforeMiddleware",
        *MIDDLEWARE,
        "django_prometheus.middleware.PrometheusAfterMiddleware",
    ]
if PROMETHEUS_METRICS_ENABLED:
    DATABASES["default"]["ENGINE"] = DATABASES["default"]["ENGINE"].replace(
        "django.db.backends", "django_prometheus.db.backends", 1
    )
    if USE_REDIS:
        CACHES["default"]["BACKEND"] = "django_prometheus.cache.backends.redis.RedisCache"

# The reverse proxy terminates TLS and sets this forwarded header itself.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=31536000)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", default=False)
SECURE_HSTS_PRELOAD = False

# Security headers
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True

MIDDLEWARE.insert(2, "whitenoise.middleware.WhiteNoiseMiddleware")
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {"location": str(PRIVATE_CONTENT_ROOT)},
    },
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "config.production_logging.SafeJsonFormatter",
            "fmt": "%(asctime)s %(levelname)s %(name)s %(message)s",
        },
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "json"},
    },
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", default="INFO")},
    "loggers": {
        "django": {"handlers": ["console"], "level": env("DJANGO_LOG_LEVEL", default="INFO"), "propagate": False},
        "gunicorn.error": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}

SENTRY_DSN = env("SENTRY_DSN", default="")
if SENTRY_DSN:
    from config.observability import scrub_sentry_breadcrumb, scrub_sentry_event

    import sentry_sdk
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=env("SENTRY_ENVIRONMENT", default="production"),
        release=env("RELEASE_VERSION", default=""),
        integrations=[DjangoIntegration(), CeleryIntegration()],
        send_default_pii=False,
        data_collection={
            "user_info": False,
            "database_query_data": False,
            "queues": False,
            "http_bodies": [],
            "stack_frame_variables": False,
            "frame_context_lines": 0,
            "cookies": {"mode": "allowlist", "terms": []},
            "http_headers": {"request": {"mode": "allowlist", "terms": []}},
            "url_query_params": {"mode": "allowlist", "terms": []},
        },
        before_send=scrub_sentry_event,
        before_breadcrumb=scrub_sentry_breadcrumb,
        traces_sample_rate=0,
    )
