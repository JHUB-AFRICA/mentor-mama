# University Coordinator Verification

**Date:** 2026-11-09
**Stage:** VERIFY
**Status:** BLOCKED — source changes implemented; runtime acceptance unavailable
**Scope:** Coordinator Overview, Cohorts & Students, student invitations, Placements, Reports, Activity, and Placement Detail.

## Source review

Read the Coordinator authority matrix, placement handoff contract, Overview audit, and account lifecycle rules.
The Coordinator is institution-scoped and may create/release placements, manage cohorts and students, monitor
progress, review approved signals, and request institution-scoped reports. Ward allocation, mentor assignment,
induction, session logging, and placement completion remain outside the role.

## Implemented checks

- Overview loading/error states no longer render false healthy zeroes.
- Overview and Reports expose the full institution lifecycle pipeline.
- Placement Detail includes a retryable load failure state and paused lifecycle progression.
- Cohort and student administration have separated actions and hierarchy.
- Single-student invitations reuse the institution-scoped bulk validation and review contract.
- Enrolment search is available inside the enrolment dialog for large rosters.
- Coordinator placement, cohort, invitation, and scope authorization tests pass.
- Portal TypeScript, production build, scoped ESLint, and `git diff --check` pass.

## Required verification not completed

- `sinaps health` is BLOCKED: 7% disk free, 86% RAM used, swap almost full. The user authorized continuing with available resources; no cleanup or runtime service was attempted.
- Fixed the logged `/api/v1/institution/students` 500: `page_institution_students` referenced Django `OuterRef` and `Exists` without imports. The imports are now explicit. Existing `test_coordinator_roster_reports_and_filters_cohort_assignment` covers both branches of this query.
- `python manage.py check`, Python compilation of the changed service, portal-wide ESLint, and `git diff --check` pass.
- Focused `pytest tests/test_institutions.py` could not set up its eight database-backed tests: PostgreSQL refused the connection. No test assertion ran.
- Migration state and pending-migration application could not be checked: PostgreSQL is unreachable. Docker CLI access is denied at `/var/run/docker.sock`.
- `lint-imports` ran and still reports nine broken architecture contracts (three contracts kept); see its command output for the full list. These are outside the missing ORM imports.
- Source-level adversarial inspection confirmed institution roster/cohort queries use `actor.institution_id`; placement export rows are filtered to the Coordinator's institution; and placement commands call scope checks. These are source observations only, not tenant-isolation runtime evidence.
- No Argent devices are available (`list-devices` returned none), so no real browser journey or live cross-institution checks were possible.

## Roster UI refinement and adjacent source audit

- Reworked the roster header and filter toolbar into a clearer hierarchy, aligned search and cohort filters, added a one-action filter reset, improved table column proportions/status treatment, and replaced clickable table rows with a semantic View button.
- The roster count now reflects the filtered result count across pages. The summary roster total comes from an unfiltered count request, so search/filter activity does not change the institution total. Summary failures render as unavailable instead of false zeroes. Filtered empty results now explain that no rows match the selected criteria.
- Adjacent source audit found a product-contract mismatch: `docs/ux/screens/27-coordinator-cohorts.md` says deactivated students are hidden from the Coordinator roster, while `CoordinatorStudentManagement.tsx` offers a Deactivated filter that calls the same API. This was resolved in the follow-up below by keeping the default cohort roster hidden and allowing institution-scoped read-only inspection only under the explicit status filter.
- Targeted ESLint and portal TypeScript checks pass after the UI change. A browser render check remains blocked because Argent reports no devices and the environment health gate is blocked.

## Follow-up: institution roster and cohort edge cases

- The Manage Students Deactivated filter is now honored only when explicitly selected; the default roster and cohort selector continue to exclude deactivated accounts. The API query remains institution-scoped. Added a regression covering the default and explicit paths, including a foreign institution's deactivated student. Updated the UX contract and resolved the visibility question in `docs/OPEN-QUESTIONS.md`.
- Enrolment now rejects a student already enrolled in an active cohort with overlapping dates, using a stable 409 `CohortOverlap` domain error. The student's row is locked during the check to serialize concurrent enrolment attempts. Non-overlapping cohort history and same-cohort idempotent replay remain allowed. Added an API regression test.
- Archived cohorts no longer count as active cohort assignment in roster filters or appear in the active cohort-name projection. Added coverage to the roster filter test.
- Successful enrolment now invalidates the institution roster and cohort-detail queries, so the visible membership updates immediately.
- Python compilation and Django system checks pass; targeted portal ESLint, TypeScript, and `git diff --check` pass.
- The focused regression tests were attempted but cannot set up because PostgreSQL is unreachable. Assertions have not run. Browser acceptance and live API checks remain blocked by the environment recorded above.

## Approved cohort functionality implemented

- Cohort edit validates ordered dates and rejects date changes that would create overlapping memberships. Archive is soft and retains cohort/placement references.
- Bulk enrolment previews up to 100 selected students, reports ready/already-enrolled/overlap/unavailable counts, and rechecks every row during atomic commit.
- Cohort detail reports placement counts by lifecycle state and enrolled students without placements; no unsupported completion percentage is presented.
- Membership removal requires a reason, records actor/time/reason, retains the membership row, and preserves placement records. A conditional unique constraint allows a later active membership after removal.
- Coordinator detail and roster screens expose the operations, including preview before bulk confirmation.

## Email lifecycle audit

- Notification mail is plain text only; there are no HTML alternatives in the email delivery module.
- Account invitation, password reset, email verification, MFA challenge, and security status messages are present and remain mandatory. Optional placement, programme, and account-activity mail follows the corresponding notification preference.
- Added recipient-safe lifecycle messages for placement scheduling (institution Coordinators), orientation acknowledgement (assigned mentor), induction completion (assigned student), safeguarding status (report submitter), and mentor reassignment (incoming and outgoing mentors).
- Safeguarding and session emails contain generic prompts only; no concern narrative, session notes, or assessment content is copied into email.
- Session logging remains quiet unless supervisor follow-up is requested; feedback and final-assessment messages go to their current authorized institutional reviewers.

## Verification for this expansion

- Django checks and migration drift check pass; migration `institutions.0004` was generated. Migration-history DB check warns because PostgreSQL is unreachable.
- Python compilation, targeted portal ESLint/TypeScript, and `git diff --check` pass.
- Focused email and institution pytest modules were attempted but all database-backed setup fails to connect to PostgreSQL; no assertions ran.
- Do not claim database behavior or live UI acceptance until pending migration is applied and browser/API journeys are rerun.

## Security and edge-case plan

When the environment is repaired, verify another institution cannot read students, cohorts, placements, activity,
exports, or restricted narratives; verify Coordinator denial for ward allocation, mentor assignment, completion,
and mentor/session data; then exercise empty institutions, API failures, expired invitations, duplicate email and
registration numbers, large roster pagination, and failed/expired exports.

## Release decision

Do not mark the Coordinator actor complete until the database-backed API suite, migration check, import-boundary
contracts, and live browser journey are resolved. Prior full-suite evidence in the earlier verification attempt
reported four unrelated backend failures (anonymous feedback disabled by policy, two stale auth expectations, and
one pause-date assumption); reconcile those when the database environment is available. The current regression's
test remains unexecuted because PostgreSQL is unavailable.
