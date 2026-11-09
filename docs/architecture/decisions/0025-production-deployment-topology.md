# ADR 0025: Managed VPS production deployment

- **Status:** Accepted for implementation; runtime and deployment acceptance are still required
- **Date:** 2026-11-09
- **Risk:** Architectural

## Context

MentorMAMA is a Django modular monolith with two Vite frontends, PostgreSQL, Redis, and Celery worker/Beat processes. The target is a managed VPS, not a cloud container platform. Production needs TLS, safe routing, container health checks, horizontal API process scaling, monitoring, error reporting, durable local volumes, and recoverable releases.

## Decision

Use Docker Compose on the managed VPS. Caddy terminates TLS and routes public and portal hostnames. It discovers and load-balances API replicas through Docker DNS; it has no Docker socket access. PostgreSQL, Redis, API, worker, Beat, frontends, Prometheus, and Grafana run as separate services. Only Caddy publishes public ports. Grafana binds to loopback and data services remain private.

Keep the existing local filesystem storage for private content and exports on named volumes shared across API/worker containers on this host. Pair file backups with PostgreSQL backups. Configure an optional Sentry SDK with strict event scrubbing; do not send user, request, body, URL, breadcrumb, or local-variable data. Prometheus/Grafana handle service metrics and dashboards; Docker's rotating local log driver and JSON stdout handle logs.

## Consequences

- API and worker replicas can be adjusted separately within the VPS's CPU and memory limits.
- A VPS outage remains a complete service outage. This is not host-level high availability.
- Moving to multiple VPS hosts requires an external load balancer/orchestrator and shared PostgreSQL, Redis, private-file, and export services.
- A single Beat process is required to avoid duplicate scheduled tasks.
- Prometheus/Grafana share the host's resources and disk; retention and dashboards must be monitored.
- Sentry is inactive unless the operator configures a DSN; its vendor/region/retention remain operational choices.

## Alternatives considered

- **ECS/Kubernetes:** not selected because the user will host on a managed VPS and the current architecture is a single modular monolith.
- **Direct Docker socket discovery proxy:** rejected; Caddy's Docker DNS dynamic upstream avoids exposing the daemon API.
- **Self-hosted Sentry and full Loki stack:** deferred due to their larger resource and maintenance footprint on one VPS.
- **One container containing the whole app:** rejected because API, background workers, scheduler, static apps, and data services need independent restart and scaling behavior.

## Rollback

Deploy tagged images and retain the previous working tags. Roll back application images without removing volumes. Use backward-compatible migrations. Restore database and private content from matching backup timestamps only through the approved recovery procedure.

## Operational acceptance inputs

Provider and server sizing, region, DNS/domain values, backup schedule and retention, Sentry endpoint policy, Grafana access, and on-call ownership are supplied by the deployment operator. These inputs do not block local image/configuration work but do block production launch.
