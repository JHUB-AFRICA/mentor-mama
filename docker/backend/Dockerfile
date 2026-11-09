FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod \
    PYTHONPATH=/app/backend

WORKDIR /app

COPY backend/requirements /app/backend/requirements
RUN pip install --no-cache-dir -r /app/backend/requirements/prod.txt \
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

USER 10001:10001
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=3)" || exit 1

CMD ["gunicorn", "config.wsgi:application", "--config", "/app/docker/backend/gunicorn.conf.py"]
