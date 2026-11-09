# Managed VPS production containerization

**Status:** Approved implementation direction; deployment values remain operator inputs  
**Risk tier:** Architectural  
**Date:** 2026-11-09

## Architecture fit

MentorMAMA is a Django modular monolith with public and authenticated Vite frontends, PostgreSQL, Redis, Celery workers, and one Celery Beat scheduler. This plan keeps those boundaries and deploys them with Docker Compose on one managed VPS.

The VPS is a single failure domain. Compose can scale API containers on that host and Caddy can discover and balance across them, but this does not provide host-level high availability. Scaling across multiple VPS hosts requires the provider's managed load balancer plus shared database/cache/file services, or a deliberate move to an orchestrator.

## Production services

- Caddy owns ports 80/443, obtains and renews public TLS certificates, routes the public host to the website, and routes the portal host's API/admin/health paths to Django. Remaining portal paths go to the portal static server.
- Caddy's DNS upstream discovers API replica IPs on Docker's bridge network and balances requests. It does not need access to the Docker socket.
- Django API runs Gunicorn under a non-root user. Its containers have no source bind mounts and use existing `/health/live` and `/health/ready` probes.
- Public site and portal use separate production Vite build stages and unprivileged static servers.
- PostgreSQL and Redis run on the VPS in private Compose networks with no published host ports. Named volumes preserve data across container replacement.
- Celery workers scale independently from the API. Beat remains a single replica. The export and private-content volumes are shared by API and worker on this one host.
- Prometheus scrapes Django metrics over the internal Compose network. Grafana binds to localhost by default so an operator reaches it through an SSH tunnel or a provider VPN.
- Docker's `local` log driver rotates container logs. Django emits JSON logs to stdout. Optional Sentry reporting is disabled unless a DSN is supplied and removes request/user/context data before events leave the process.

## Dependencies selected

| Package | Use | Status |
|---|---|---|
| Gunicorn | Production WSGI server | Already pinned in `backend/requirements/prod.txt`. |
| `django-prometheus==2.5.0` | Request, response, database, and cache metrics | Added to production requirements; supports Django 5.2 and Python 3.12. |
| `python-json-logger==4.2.0` | Structured Django/Gunicorn process logs | Added to production requirements. |
| `sentry-sdk[django,celery]==2.74.0` | Optional error aggregation for API and worker | Added; initializes only when `SENTRY_DSN` is configured. Request, user, URL, breadcrumbs, extras, and local variables are scrubbed. Vendor, region, retention, and DSN are operator choices. |
| Caddy | TLS termination, host/path routing, DNS-based API balancing | Container image; no application package or Docker API access. |
| Prometheus + Grafana | Local metrics collection and dashboards | Container images; Grafana is localhost-bound by default. |

OpenTelemetry and a full log aggregation stack are deferred to avoid duplicating these signals on one VPS. `django-storages` is also deferred: this deployment uses the existing private filesystem storage on a persistent volume. Before moving to multiple hosts, migrate private documents and exports to shared object storage and test the paired database/file restore procedure.

## Operational constraints

- The production environment file must be kept on the VPS with mode `0600`, excluded from version control, and contain generated high-entropy secrets. The example file contains placeholders only.
- API replicas share named volumes for private content and local exports. Do not deploy separate hosts with local volumes and assume files are shared.
- Run migrations as a one-off command before rolling the new API image. API startup never migrates the database.
- Use `docker compose up --scale api=N` to add API replicas on the same host. Keep workers independent with `--scale worker=N`; never scale Beat above one.
- Back up PostgreSQL and the private-content volume from the same maintenance window. Follow `docs/operations/private-content-file-backup-restore.md`.
- Firewall inbound traffic to SSH and 80/443. Grafana remains loopback-only. Database, Redis, Prometheus, and Django metrics have no published host ports.
- Set host-level backup retention, RPO/RTO, monitoring alert delivery, and provider recovery owner before production traffic is enabled.

## Release and rollback

1. Build immutable images from the repository revision, record image digests, and scan them.
2. Back up PostgreSQL and private files before migrations or storage changes.
3. Apply only backward-compatible expand migrations with the one-off migration container.
4. Start the new services, confirm container health and the documented live/readiness/API/browser journeys, then remove old images.
5. For application failure, restore the previous image tag and restart services. Do not delete volumes. Use forward migrations or the documented matched database/files restore for data recovery.

## Remaining deployment inputs

The provider, server region/size, public and portal domains, TLS contact email, Grafana access method, Sentry DSN/region/retention, backup schedule/retention, and on-call contact must be supplied on the VPS. The Compose configuration refuses to start without the domain and required secrets. No cloud/server resources are provisioned by this repository change.
