# Background workers

MentorMAMA uses Celery with Redis as the broker. The durable source of truth is
still the PostgreSQL outbox; Redis only carries scheduled work and short-lived
worker state.

Run the worker and scheduler as managed production processes:

```bash
celery -A config worker --loglevel=INFO
celery -A config beat --loglevel=INFO
```

For local development from the repository root, the equivalent scripts are:

```bash
pnpm dev:worker
pnpm dev:beat
```

The development compose stack also manages these processes. From the
repository root, run:

```bash
docker compose -f docker-compose.dev.yml up

```

The development Compose file bind-mounts `./backend` into the API, worker, and
beat containers, so backend source changes are picked up without rebuilding the
image. Use `docker compose -f docker-compose.dev.yml up --build` (or
`pnpm dev:stack:rebuild`) when backend requirements or the Dockerfile change.

This starts `api`, `worker`, and `beat` alongside PostgreSQL and Redis. To run
the complete containerized stack, including the portal, use `pnpm dev:full`.
That command reconciles and recreates the Compose services so they share the
current network; PostgreSQL, Redis, and portal dependency data remain in named
volumes. Compose waits for healthy dependencies and starts the portal only
after the API is healthy. The portal
proxies `/api` requests to the Compose `api` service. The API startup script
checks PostgreSQL connectivity before running migrations, so transient DNS or
database startup failures produce a short retry message instead of a Django
traceback on every attempt.

The API waits for PostgreSQL and Redis health, checks database connectivity,
retries migrations during transient startup failures, and starts Django only
after migration succeeds. The worker and Beat use the internal Compose service names
(`postgres` and `redis`), not the host ports used by locally-run processes.

Use `docker compose -f docker-compose.dev.yml ps` to check backend services;
when using `pnpm dev:full`, the portal is included. Use
use `docker compose -f docker-compose.dev.yml logs -f worker beat` to inspect
outbox delivery and scheduled dispatch. Stop the stack with
`docker compose -f docker-compose.dev.yml down` when finished.

They must run alongside Django, Redis, and the portal. An invitation API response
means “queued for delivery”; the worker is the process that delivers it through
the configured email backend. Local development prints the rendered message to
the worker console; QA/staging may use Mailtrap. Production uses a process
supervisor/container platform rather than requiring an operator to keep terminal
sessions open.

The scheduler enqueues `apps.notifications.tasks.dispatch_outbox_task` every ten
seconds. The task invokes the same reconciliation command available for local
development:

```bash
python manage.py dispatch_outbox
```

If Redis or the configured email provider is unavailable, the PostgreSQL outbox
event remains pending or records a retry error. A supervisor should restart
failed worker processes.
Production should use a managed/persistent Redis instance and separate worker and
beat processes rather than running them interactively in a terminal.
