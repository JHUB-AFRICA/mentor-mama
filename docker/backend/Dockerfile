# PRIVILEGES=app (default): the container runs as the unprivileged user from the start (compose, VPS).
# PRIVILEGES=root: the container starts as root only to fix ownership of a mounted persistent disk (Render
# mounts disks root-owned), then drops to the unprivileged user before running anything.
ARG PRIVILEGES=app

FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod \
    PYTHONPATH=/app/backend \
    XDG_CACHE_HOME=/tmp/.cache

WORKDIR /app

# Pango + HarfBuzz for WeasyPrint (branded PDF documents). Fonts are bundled with the app, not installed system-wide.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements /app/backend/requirements
# Local development only: docker-compose.dev.yml sets EXTRA_REQUIREMENTS=dev.txt (pytest, ruff, watchfiles).
ARG EXTRA_REQUIREMENTS=""
RUN pip install --no-cache-dir -r /app/backend/requirements/prod.txt \
    && if [ -n "$EXTRA_REQUIREMENTS" ]; then pip install --no-cache-dir -r "/app/backend/requirements/$EXTRA_REQUIREMENTS"; fi \
    && groupadd --system --gid 10001 mentormama \
    && useradd --system --uid 10001 --gid mentormama --home-dir /nonexistent --shell /usr/sbin/nologin mentormama \
    && mkdir -p /app/backend/staticfiles /var/lib/mentormama/content-documents /var/lib/mentormama/exports /var/lib/mentormama/beat \
    && chown -R mentormama:mentormama /app/backend/staticfiles /var/lib/mentormama

COPY --chown=mentormama:mentormama backend /app/backend
COPY --chown=mentormama:mentormama docker/backend/gunicorn.conf.py /app/docker/backend/gunicorn.conf.py
WORKDIR /app/backend

# These build-only values allow Django to collect static files without connecting
# to production services. Runtime secrets are provided by the deployment host.
RUN SECRET_KEY=build-only-not-a-runtime-secret \
    ALLOWED_HOSTS=localhost \
    CSRF_TRUSTED_ORIGINS=https://localhost \
    DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
    python manage.py collectstatic --noinput --skip-checks

FROM base AS final-app
USER 10001:10001

FROM base AS final-root
COPY docker/backend/drop-privileges.sh /usr/local/bin/drop-privileges
RUN chmod 0755 /usr/local/bin/drop-privileges
ENTRYPOINT ["/usr/local/bin/drop-privileges"]

FROM final-${PRIVILEGES}
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=3)" || exit 1

CMD ["gunicorn", "config.wsgi:application", "--config", "/app/docker/backend/gunicorn.conf.py"]
