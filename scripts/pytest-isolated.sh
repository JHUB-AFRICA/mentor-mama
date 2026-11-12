#!/usr/bin/env bash
# Run backend tests against a PRIVATE database so several people/agents can test at once without clobbering each other.
# Usage: scripts/pytest-isolated.sh <name> [pytest args...]     e.g. scripts/pytest-isolated.sh overlap tests/test_placements.py -q
set -euo pipefail
name="${1:?give a short unique name, e.g. overlap}"; shift
root="$(cd "$(dirname "$0")/.." && pwd)"
url="$(grep -m1 '^DATABASE_URL=' "$root/.env" | cut -d= -f2-)"
# .env points at the docker hostname; from the host use the published port, and a database named after the caller.
url="$(echo "$url" | sed -E "s#@[^:/]*:[0-9]+/[^/?]*#@127.0.0.1:5433/mentormama_${name}#")"
cd "$root/backend"
DATABASE_URL="$url" exec "$root/.venv/bin/python" -m pytest -p no:cacheprovider --create-db "$@"
