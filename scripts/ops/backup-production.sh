#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date -u '+%Y%m%dT%H%M%SZ')"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "Environment file is not readable: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
TEMP_DIR="$(mktemp -d "$BACKUP_DIR/.backup.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

"${compose[@]}" exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$TEMP_DIR/mentormama-${TIMESTAMP}.postgres.dump"

"${compose[@]}" exec -T api python -c \
  'import sys, tarfile; t=tarfile.open(fileobj=sys.stdout.buffer, mode="w|gz"); t.add("/var/lib/mentormama/content-documents", arcname="content-documents"); t.add("/var/lib/mentormama/exports", arcname="exports"); t.close()' \
  > "$TEMP_DIR/mentormama-${TIMESTAMP}.files.tar.gz"

(cd "$TEMP_DIR" && sha256sum "mentormama-${TIMESTAMP}.postgres.dump" "mentormama-${TIMESTAMP}.files.tar.gz" > SHA256SUMS)
mv "$TEMP_DIR/mentormama-${TIMESTAMP}.postgres.dump" "$BACKUP_DIR/"
mv "$TEMP_DIR/mentormama-${TIMESTAMP}.files.tar.gz" "$BACKUP_DIR/"
mv "$TEMP_DIR/SHA256SUMS" "$BACKUP_DIR/mentormama-${TIMESTAMP}.SHA256SUMS"

echo "Created matched database and file backups for ${TIMESTAMP} in ${BACKUP_DIR}"
