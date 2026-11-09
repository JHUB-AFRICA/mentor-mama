#!/bin/sh
set -eu

attempt=1
while [ "$attempt" -le 30 ]; do
  if python -c 'import os, urllib.parse, psycopg2; db=urllib.parse.urlparse(os.environ["DATABASE_URL"]); c=psycopg2.connect(dbname=db.path.lstrip("/"), user=db.username, password=db.password, host=db.hostname, port=db.port, connect_timeout=2); c.close()' 2>/dev/null; then
    if python manage.py migrate; then
      exec python manage.py runserver 0.0.0.0:8000
    fi
    echo "PostgreSQL is reachable, but migrations did not complete (attempt ${attempt}/30). Retrying in 2 seconds…" >&2
  else
    echo "Waiting for PostgreSQL at ${DATABASE_HOST:-postgres}:${DATABASE_PORT:-5432} (attempt ${attempt}/30)…"
  fi
  attempt=$((attempt + 1))
  sleep 2
done

echo "PostgreSQL did not become ready after 30 attempts. Check that the API and postgres services share the same Compose network." >&2
exit 1
