# Continuous integration

The `CI` workflow runs for pushes to `main`, `develop`, and `feature/**`, pull
requests targeting `main` or `develop`, and manual dispatches. It is the release
readiness check for source changes; it does not deploy or publish images.

## Gates

- **Backend:** Ruff, Django system checks, migration drift detection, and the
  complete pytest suite against PostgreSQL 16.
- **Frontend:** web and portal lint, TypeScript checks, and production builds.
- **Portal browser smoke:** unsigned-in authentication/recovery journeys and a
  mocked programme-admin learning-module authoring journey in Chromium. The
  module creation API itself is covered by the backend multipart integration
  test. Other authenticated journeys still require deterministic role accounts
  and workflow-specific fixture state and are not included here.
- **Production configuration:** validates `docker-compose.prod.yml` using the
  safe example environment file.
- **Production images:** builds backend, web, and portal images after backend,
  frontend, and Compose checks pass. Images are built locally on the runner and
  are not pushed to a registry.
- **Required summary:** records each gate's result and fails if any required
  gate did not succeed.

## Reports and failure evidence

The backend job uploads a JUnit XML report. The portal browser job uploads its
JUnit and HTML reports, plus Playwright traces, screenshots, and videos when
available. Artifacts are retained for 14 days. Open the workflow run's
**Artifacts** section to download them; the **CI results** step summary gives a
quick status for each gate.

## Running checks locally

Use the same commands from the repository root:

```sh
cd backend
ruff check apps tests
python manage.py check
python manage.py makemigrations --check --dry-run
pytest --create-db -v
cd ..
pnpm install --frozen-lockfile
pnpm --filter @mentormama/web lint
pnpm --filter @mentormama/web exec tsc --noEmit
pnpm --filter @mentormama/web build
pnpm --filter @mentormama/portal lint
pnpm --filter @mentormama/portal exec tsc --noEmit
pnpm --filter @mentormama/portal build
docker compose --env-file .env.production.example -f docker-compose.prod.yml config --quiet
```

The browser job additionally needs Python dependencies from
`backend/requirements/dev.txt`, Chromium with Playwright system dependencies,
and a migrated PostgreSQL 16 database. The Playwright configuration starts the
API and portal dev server for the run.
