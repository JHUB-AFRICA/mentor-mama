# Observability and health probes

MentorMAMA exposes two unauthenticated probes for the process supervisor and
deployment platform:

| Endpoint | Purpose | Dependencies |
| --- | --- | --- |
| `GET /health/live` | Confirms the web process is serving requests | None |
| `GET /health/ready` | Confirms the service can use its configured dependencies | PostgreSQL and Redis/cache when enabled |

The readiness response contains only `status` and stable component states. It
never includes connection strings, exception messages, user data, queue
payloads, or domain records. A dependency failure returns HTTP `503` with
`status: unavailable`; liveness remains `200` so supervisors can distinguish a
live but unready process from a crashed process.

Exports are implemented as a separate asynchronous feature. The managed-VPS
Compose deployment uses a named local volume shared by API and worker; its
backup must be paired with the database backup. Other production deployments can
use the configured S3-compatible adapter. The API uses an immutable export
record, audited scope and row count, and a short-lived signed download URL.

The managed-VPS stack adds `django-prometheus` metrics at `/metrics`, available
only on the private monitoring network, and Prometheus/Grafana dashboards. Django
logs use an allowlisted JSON formatter that strips arbitrary `extra` fields and
exception messages. Optional Sentry reporting is disabled unless configured;
the event filter removes request, user, URL, message, breadcrumb, local-variable,
and extra data before sending.
