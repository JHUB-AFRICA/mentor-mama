# EVIDENCE-020 — Reporting read-side indicators

Date: 1 September 2026

## Delivered

- Added `GET /api/v1/dashboard` as the first analytics read contract.
- Added analytics-owned `analytics_interruption_causes` materialized view and
  `refresh_analytics` command plus an hourly Celery refresh task with bounded
  retries and structured success/failure logging, with no domain foreign keys.
- Added analytics-owned `analytics_facility_indicators` and
  `analytics_cohort_indicators` materialized views containing only aggregate
  placement/session counts and bare scope identifiers.
- Added analytics-owned `analytics_feedback_aggregate` with SQL-enforced
  minimum-three response suppression; the mentor workspace shows only approved
  aggregate scores and response counts.
- Staff dashboard lifecycle/session counts now read from these projections;
  operational projections refresh every five minutes and interruption causes
  refresh hourly through Celery beat.
- Feedback aggregates refresh every fifteen minutes through Celery beat.
- Added `GET /api/v1/dashboard/interruptions`, reading the projection and
  grouping by facility, cohort, and controlled pause reason with elapsed days.
- Enforced actor scope through placement, mentorship, and safeguarding public
  APIs; safeguarding output contains counts and severity only.
- Added branded indicator cards to Programme Admin, Coordinator, and Nurse
  Manager workspaces.
- Added a responsive interruption monitoring table to those workspaces.
- Added `GET /api/v1/placements/{placement_id}/progress`, a scoped,
  computed-on-read progress value object covering induction, mentorship,
  assessment, safeguarding counts, and an explicit unavailable learning state.
  The participant workspace renders the safe milestone summary without notes,
  scores, or safeguarding narratives.
- Fixed fresh-database migration ordering for operational projections by
  declaring the facilities and mentorship dependencies before the materialized
  views are created.
- Added asynchronous staff exports for placements and cohorts with immutable
  export records, server-derived scope, safe operational fields, audit events,
  expiry, and signed downloads. Student access is denied and safeguarding
  narratives, session notes, and confidential feedback are excluded.
- Added liveness and readiness probes for deployment/runtime supervision.
- Kept analytics disposable and computed-on-read while pilot data volume is
  small; no analytics foreign keys or source-of-truth mutations were added.

## Verification

- Dashboard API contract: passed.
- Feedback minimum-three suppression contract: passed.
- Migration state validation (`makemigrations --check`): passed.
- Materialized-view migration and refresh-backed interruption contract: passed.
- Celery task registration and hourly beat schedule: configured.
- Celery registry verification: analytics refresh and notification outbox tasks
  both registered successfully with forced explicit discovery.
- Full backend regression, module-boundary checks, production builds, portal
  lint/type checks, and diff validation: passed.
- Full backend suite: passed.
- Portal TypeScript, lint, production build, and `git diff --check`: passed.
- Authenticated Programme Admin browser journey: passed and observed a 200
  response from `/api/v1/dashboard`.
- Full isolated browser invocation: 9 passed. Mentor induction, offline session,
  safeguarding review, and student confirmation journeys now seed their own
  deterministic fixtures; no cross-test lifecycle mutation remains.
- Placement progress API contract and participant portal build: passed.
- Fresh isolated full backend suite after migration dependency correction: 96
  passed.
- Full cross-domain browser lifecycle: 9 passed, covering authentication/MFA,
  role onboarding, placement creation/allocation, student confirmation,
  induction, mentorship/offline reconciliation, safeguarding review, progress,
  and sign-out.
- Final backend suite after export, health, and migration changes: passed.
