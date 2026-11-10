# Managed VPS deployment runbook

## Before first start

1. Provision a managed VPS sized for PostgreSQL, Redis, Django, both static sites, Prometheus, and Grafana. Measure memory and disk under staging load before choosing production API replicas.
2. Install a current Docker Engine and Docker Compose plugin v2.20 or newer (the root Compose file uses `include`). Configure the provider firewall to allow SSH only from the operator's trusted IPs, and TCP 80/443 from the internet. UDP 443 is optional for HTTP/3.
3. Point `PUBLIC_DOMAIN` and `PORTAL_DOMAIN` DNS A/AAAA records at the VPS. Do not start Caddy until public DNS resolves to this server.
4. Create `.env.production` from `.env.production.example`, replace all examples, keep database/Redis passwords hexadecimal so URI parsing is unambiguous, and set file mode `0600`. Generate `SECRET_KEY` and passwords with `openssl rand -hex 32`.
5. Set an off-host backup destination and retention policy. The included backup script writes local backup files; copy completed checksummed pairs to encrypted off-host storage.

AI is disabled by default. For the MVP it uses the OpenAI API: set `AI_ENABLED=true` and `AI_API_KEY` in `.env.production` (`AI_API_BASE_URL` and `AI_MODEL` default to OpenAI and `gpt-4o-mini`), recreate the API service, then run `docker compose exec api python manage.py ai_smoke_test` to confirm the key. The key is passed only to the API container. Never place it in portal build variables or commit the VPS env file. Set a monthly spend limit on the OpenAI project. See `docs/architecture/ai-integration-plan.md` for scope, the later self-hosted switch, and rollback.

## Build and first deployment

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres redis-cache redis-broker
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

Confirm `/health/live` and `/health/ready` on the portal host, sign in, download an authorized private library document, load a cover image, and verify an unauthorized programme cannot fetch that file. Open Grafana with an SSH tunnel (`ssh -L 3000:127.0.0.1:3000 operator@server`) and confirm Prometheus targets and the MentorMAMA Operations dashboard.

The Prometheus 5xx rule and API scrape alert show in Prometheus/Grafana. Notification delivery is not configured by this stack; connect an owned alert destination before launch. Sentry is optional. Configure `SENTRY_DSN` only after selecting its region/retention and reviewing the privacy filter.

## Routine operations

- **Scale API on the VPS:** `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --scale api=2`. Increase gradually and watch host RAM/CPU and database connections. The default Gunicorn setting is one worker per API container so Prometheus process metrics are not hidden across Gunicorn workers.
- **Scale background jobs:** add `--scale worker=N` based on queue age and host capacity. Keep Beat at exactly one instance.
- **Update images:** build with a recorded source revision, run a backup, run the migration one-off if needed, then recreate services. Keep the prior image tags for rollback. Do not run `down -v`.
- **Logs:** `docker compose ... logs --since=30m api worker beat caddy`. Docker's local driver rotates logs; export incidents to access-controlled storage if retention is needed.
- **Metrics:** Grafana is bound to server loopback. Prometheus and `/metrics` have no host ports; Caddy returns 404 for external `/metrics` requests.
- **Disk:** monitor Docker data, PostgreSQL, Redis broker, Prometheus retention, and backup destinations. Keep backups off the VPS so disk failure does not remove both data and recovery copies.

## Backup and restore

Run `scripts/ops/backup-production.sh` at the planned backup interval. It creates a PostgreSQL custom dump, a private-content/export archive, and SHA-256 checksums with one UTC timestamp. Copy the three outputs off-host, encrypt them, and verify checksums after transfer. Restrict access because the archives contain institution data and private learning content.

Restore to an isolated VPS first. Verify checksums, restore PostgreSQL with `pg_restore --clean --if-exists` into the selected database, extract the matching files archive into the persistent file volume, restart API/worker, and verify representative authorized downloads, cover images, exports, and cross-programme denial. Do not combine a database backup with a files archive from another timestamp without review. See `private-content-file-backup-restore.md` for the detailed private-file recovery constraints.

## Production launch blockers

- Django is pinned to the supported 5.2 LTS line. Run full backend/API/security verification on the upgraded framework before public launch.
- Set and test backup schedule, off-host retention, restore owner, RPO/RTO, and alert notification destination.
- Test the full Docker build and Compose topology on a staging VPS. The local environment currently has no usable Docker daemon, so this repository change cannot claim runtime readiness.
- Complete the content-upload and cross-programme access journey against persistent volumes before production traffic.
