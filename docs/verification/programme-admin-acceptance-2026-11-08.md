# Programme Admin acceptance pass — 2026-11-08

## Scope and status

This is a source-level acceptance review. It is not a release sign-off: live
browser, database, migration, and device-width checks could not run in this
workspace because Docker/browser targets are unavailable and free disk is below
the Sinaps verification gate.

| Area | Source review | Live acceptance still required |
| --- | --- | --- |
| Invitations | Invitation role/scope controls and success/error feedback reviewed; server remains the authority for invite eligibility and scope. | Create, resend, expire, accept, and changed-scope link invalidation with allowed and denied actors. |
| People & access | Programme recovery inbox excludes self; access/status/session controls use scoped API operations and now confirm outcomes with toasts. | Cross-programme denial, reason validation, stale account, network failure, and phone-width table/drawer behavior. |
| Placements | Admin action surface is capability-driven; placement commands and notes now show completion feedback. | Every allowed lifecycle transition and a denied/invalid transition; retry after network failure; desktop/mobile detail and action menus. |
| Programme setup | Settings and directory writes reviewed; directory create/archive/ward availability show completion feedback. | Form validation, upload limits, import preview/commit/rollback, active/inactive coverage, and responsive detail screens. |
| Content | Scoped document upload/download and content status paths reviewed; archive/publish reports completion. | Allowed/denied audience download, file integrity and size/type rejection, revision restore, browser upload, mobile authoring. |
| Reports | Period selector, event trends, safeguarded aggregates, export formats, and report scope corrected/documented. | Current and empty periods, export lifecycle, data parity with source queries, and desktop/mobile charts/table. |
| Activity | Filter, pagination, retry, and refresh paths reviewed; explicit refresh reports success/failure. | Role scope, empty/error states, keyboard use, filter combinations, and mobile layout. |

## Data and authorization decisions

Report contents and deferred views are defined in
`docs/architecture/programme-reporting-analytics.md`. Placement interruptions
are placement continuity records and are never presented as safeguarding
cases. Programme Admin safeguarding reporting is aggregate-only. No historical
state trend is inferred from current counts.

Dashboard number sources and definitions:

- Programme setup, active/invited/suspended accounts, and active Coordinator /
  Nurse Manager readiness come from `/api/v1/dashboard/summary`; the summary
  intentionally excludes the signed-in Programme Admin. The People page says
  so beside its counts.
- Placement lifecycle counts come from `/api/v1/dashboard` and the live,
  programme-scoped placement register. The chart includes draft, scheduled,
  awaiting student, orientation, induction, active, paused, completed,
  archived, and withdrawn, so its slices reconcile to the total. The
  Programme Admin dashboard does not replace these current counts with the
  five-minute materialized projection.
- Active student/mentor account counts come from the People API's filtered
  pagination totals. Period placement/session/audit trends come from
  `/api/v1/reports/overview`; they count dated events and do not reconstruct
  historical states.
- Library published/draft/archived counts come from the full programme library
  response, including learning modules, and use each record's actual status.
  Required training readiness is based on published required modules visible
  to mentors. Recovery requests are counted from the programme-scoped pending
  recovery endpoint.

Recovery ownership, reason capture, audit events, and outbox notifications are
implemented in the identity recovery service. Programme-admin decisions record
`account.mfa_recovery_request_reviewed`; resets also record
`account.mfa_recovery_override`, revoke sessions, and enqueue a security
notification. Closing a request enqueues a reviewed notification. Platform
recovery is separate and excludes the reviewing superuser's own request. Verify
outbox delivery, not only enqueue, during live acceptance.

File retention, matching database/volume backups, restore checks, and rollback
steps are in `docs/operations/private-content-file-backup-restore.md`.

## Remaining acceptance gate

Before marking Programme Admin complete, apply the pending migrations in the
local container environment; run backend and portal checks; verify the complete
Admin paths with seeded, isolated programme data; inspect authorization denials
and error/retry states; and render representative screens at desktop and 375px
width. Record actual results and clean up only the temporary fixtures created
for that run. Student is the next role after this gate passes.
