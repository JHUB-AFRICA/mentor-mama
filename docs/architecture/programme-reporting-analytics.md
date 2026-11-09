# Programme reporting analytics design

## Purpose

The Programme Administrator reports surface must distinguish live operational
counts from historical analytics. Current dashboard indicators are calculated
from role-scoped records and projections; they are not a month-by-month fact
table. The UI therefore must never label current totals as historical data.

## Implemented reporting contract

`GET /api/v1/reports/overview?from=YYYY-MM-DD&to=YYYY-MM-DD` now returns a
programme-scoped live snapshot, period activity totals, previous-period
comparisons, and daily trend points. State KPIs remain live because the
authoritative placement record does not retain historical state snapshots;
period activity is calculated from placement creation/completion dates,
mentorship session dates, and append-only audit events.

The endpoint rejects inverted ranges and ranges longer than one year. A null
comparison means there is no valid denominator in the previous period; the UI
does not turn that into a fabricated percentage.

## Programme Admin report decision (2026-11-08)

The Programme Admin needs these views for the current pilot:

- Overview: current placement lifecycle counts, active people counts, and
  period totals/comparisons for placement creation/completion, mentorship
  sessions, and append-only programme audit activity.
- Placements: current lifecycle distribution plus placement interruption and
  continuity facts. These records belong to placement operations.
- People: current active, invited, and suspended counts. Historical cohort
  movement is not available from approved sources.
- Mentorship: current session totals and operational placement counts.
- Engagement: current activity and session counters only.
- Safeguarding: aggregate concern counts by priority only. Case details and
  narratives remain in the authorised safeguarding workflow and are excluded
  from Programme Admin exports.
- Custom reports: scoped placement snapshot export in CSV, XLSX, JSON, or PDF.

The live sources above are approved for the pilot and do not imply historical
state. Period trends are daily event counts for the selected month, not a
historical snapshot of how many people or placements were in each state.
Programme Admin placement counts come from the live scoped placement register,
not the five-minute operational materialized views. The status breakdown covers
all ten lifecycle states (draft, scheduled, awaiting student, orientation,
induction, active, paused, completed, archived, and withdrawn), so its slices
reconcile with the displayed total. The dashboard's missing-setup attention
count excludes completed, archived, and withdrawn placements because they do
not have a handoff left to unblock.
People summary counts intentionally exclude the signed-in Programme Admin;
the People page labels this scope explicitly. Reports show completed placement
counts rather than a percentage whose denominator mixed archived or withdrawn
records with ongoing placements.

Defer monthly lifecycle/people trends, historical engagement cohorts, and
programme overview, engagement, or safeguarding-summary exports. They need an
approved retention period, privacy and small-group rules, named decision use,
and an owned data contract before implementation. Do not substitute current
counts or interruption records for those views.

## Proposed read model (deferred)

Add an analytics-owned daily fact table, `analytics_programme_daily_metrics`:

- `program_id`
- `metric_date`
- `placements_total`, `placements_active`, `placements_awaiting_student`,
  `placements_scheduled`, `placements_induction`, `placements_completed`
- `people_total`, `active_people`, `invited_people`, `suspended_people`
- `sessions_total`, `sessions_this_week`
- `open_concerns`, `high_concerns`, `medium_concerns`, `low_concerns`
- unique key: `(program_id, metric_date)`

A scheduled projection refresh writes one row per programme per day. The
projection is derived from the module public APIs and approved analytics
boundaries; restricted safeguarding narratives never enter the table.

Add `analytics_engagement_daily` for activity-specific reporting:

- `program_id`, `metric_date`
- `activity_events`, `active_participants`, `sessions_logged`
- optional role breakdown counts, without event payloads or private notes

## API contract

If the deferred time-series requirements are approved, introduce or extend
`GET /api/v1/reports/overview?from=YYYY-MM-DD&to=YYYY-MM-DD`.

The response should contain:

- `period`: normalized inclusive dates
- `summary`: KPI values for the period
- `placement_status`: lifecycle distribution
- `trend`: ordered daily or monthly points
- `engagement`: safe aggregate counters
- `safeguarding`: counts by severity
- `availability`: per-section status (`available`, `empty`, or `not_ready`)

The endpoint remains programme/role scoped through the existing scope resolver.
It should return `not_ready` for periods before the first projection rather
than silently returning zeroes. The current `/dashboard` endpoints remain the
live operational contract used by role workspaces.

## Export implementation

The existing asynchronous `ExportRecord` contract now supports `csv`, `xlsx`,
`json`, and `pdf`. The request accepts `format`, `from`, and `to`; the worker
applies the date range to placement windows and writes a format-specific
storage key. Downloads return the correct extension and content type.

XLSX/CSV/JSON contain the complete placement dataset. PDF contains the same
dataset plus branded summary metadata, a status chart, and a placement-start
trend chart. All formats use the same scoped source rows.

## Custom reports

Extend the existing export contract rather than creating a second export
system. Supported request types should become:

- `placements`
- `cohort`
- `programme_overview`
- `engagement`
- `safeguarding_summary`

Each export stores the normalized period and scope in `ExportRecord.filters`.
The worker validates capability and scope before generating a CSV. Restricted
safeguarding content is excluded from every Programme Administrator export.

## Failure and UX rules

- A failed request renders an actionable retry state.
- An empty period renders an explicit empty state, not a zero-valued chart.
- A period before projection availability renders “historical reporting is not
  available yet” and identifies the missing analytics capability.
- Export requests show queued/progress/completed/failed status through the
  existing toast and Recent reports list.
- Month selection maps to an inclusive date range in the API; it is not a
  client-only label.

## Rollback

The first release can retain the current live `/dashboard` path behind the
existing report page while the daily projection is introduced. If the new
projection fails, the reports page falls back to live indicators and marks
historical sections unavailable. Removing the new table, refresh job, and
endpoint is the rollback path; existing placement and export contracts remain
untouched.
