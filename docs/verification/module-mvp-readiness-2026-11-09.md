# MentorMAMA module MVP readiness audit — 9 November 2026

## Decision

The repository has broad source coverage for the pilot workflow, but the product
is **not currently MVP-ready for release**. The role journeys have not all been
verified against a running database and browser, one required feedback mode is
deliberately unavailable for privacy reasons, several operational launch
controls remain unresolved, and the current machine cannot run the blocked
verification work (`sinaps health`: disk 7% free, Docker unavailable, no
listeners; PostgreSQL connection refused).

“Implemented in source” below means code and contracts exist. It does not mean
the feature passed live acceptance. “MVP blocker” means a required pilot promise
or release gate is incomplete; “conditional” means it blocks only if the
corresponding optional capability is enabled for the pilot.

## Domain modules

| Module | MVP readiness | What is present | What remains before MVP acceptance |
| --- | --- | --- | --- |
| Core platform (`core`) | **Not release-ready** | Stable API errors, audit, idempotency, transactional outbox, health endpoints, and database constraints are present in source. | Reconnect PostgreSQL; apply and reconcile all pending migrations; rerun backend and concurrency/invariant suites. Prove backup and restore, production restricted DB access, and error/retry paths. Import-linter has nine recorded broken contracts that need review. |
| Identity and accounts (`identity`, `auth`) | **Implemented, not accepted live** | Invitation/activation, password reset/change, cookie sessions, MFA/recovery, account status, profile, and notification preferences have source flows. | Verify full invitation-to-activation, expiry/resend, duplicate email/registration number, MFA recovery, revocation, CSRF and throttling with live services. Verify text-only email delivery in the sandbox. |
| Institution onboarding and cohorts (`institutions`) | **Not ready** | Institution-scoped student administration, CSV/single invitations, cohorts, overlap-aware enrolment, and the latest edit/archive/bulk-preview/audited-removal source changes exist. | Apply the new `institutions.0004` migration; run API tests and cross-institution denial checks; verify browser workflows. The latest cohort enhancements have static checks only. |
| Facilities and wards (`facilities`) | **Implemented, acceptance outstanding** | Programme-owned directories, ward capacity rules, mentor imports, and Nurse Manager facility-scoped screens/actions exist. | Live test capacity conflict and occupancy invariants, import preview/commit/rollback, archived ward behavior, and cross-facility access. Verify role screens at desktop and mobile sizes. |
| Placement lifecycle (`placements`) | **Core implemented, not MVP-accepted** | Coordinator creation/release, Nurse Manager ward/mentor allocation, student acknowledgement, pause/resume, completion/archive/withdrawal, history, and state guards exist. Allocation is manual by design. | Run the complete role-to-role lifecycle and denied-action journeys against the database. Apply pending placement migration(s), verify concurrency/capacity and institution/facility boundaries, and test failed API requests and terminal states. |
| Induction (`induction`) | **Implemented, not verified** | Versioned checklists, required responses, mentor sign-off, atomic placement activation, and group induction exist. | Apply the documented induction batch migration; verify incomplete/mixed-template/unauthorized batches roll back fully, and successful sign-off activates only the selected students. |
| Mentorship and sessions (`mentorship`) | **Core implemented, not verified** | Session logging, validation, duplicate protection, offline queue/reconciliation, follow-up, and batch session/attendance source flows exist. | Apply session-batch migration(s); exercise offline retry, duplicate and partial-failure behavior with live APIs; review whether session correction and follow-up ownership are needed for the pilot. These latter items are enhancements unless required by pilot operations. |
| Assessments and feedback (`assessments`) | **Not ready** | Final assessment and confidential placement-linked feedback have scoped source flows and reviewer paths. | **Anonymous feedback is unavailable.** The current audit/idempotency/outbox metadata can correlate a supposedly anonymous submitter, so the API fails closed and the UI disables it. Resolve the open privacy design and implement unlinkable persistence before claiming the complete feedback MVP. Run due/not-due, duplicate, reviewer-scope, and notification tests. |
| Safeguarding (`safeguarding`) | **Workflow implemented; operationally not ready** | Concern submission, restricted review, assignment, finding/action/closure, outcome, audit, and generic notifications exist in source. | Decide retention period and named operational owner; verify restricted production DB access; run live student/mentor/reviewer isolation tests and prove no narrative enters notifications, exports, or logs. |
| Notifications and email (`notifications`) | **Partially ready; delivery unverified** | Transactional outbox, retry, inbox, preferences, digest, account/security messages, and lifecycle event routing exist. Mail is now plain text, with additional handoff routes added in the latest change. | Test recipient routing, retry/idempotency, opt-outs versus mandatory messages, and delivery status in the sandbox. No provider rendering or delivery-observability proof exists; production delivery policy/credentials remain a release configuration task. Latest lifecycle additions have static checks only. |
| Learning and mentor training (`learning`) | **Pilot implementation in progress; scope decision needed** | Programme-scoped learning, quizzes, attempts, completion, mentor progress, and configurable placement-release training gate exist. | Confirm whether training is required for every pilot mentor. If enabled, verify the full learner/quiz/progress/gate path and programme policy controls. Richer reporting is not an MVP blocker by itself. |
| Content library (`content`) | **Conditional / incomplete for production use** | Scoped published reads, Programme Admin authoring, revision snapshots, audit, and private document upload/download exist. | Media storage and publishing governance remain incomplete. If documents are used in the pilot, verify private storage permissions, file validation, role/audience isolation, backup/restore, retention, and rollback before production. |
| Analytics and reporting (`analytics`) | **Basic operational slice implemented; exports conditional** | Role-scoped dashboard/read models, progress, and asynchronous exports exist in source. | Verify source parity, scope, failed/expired export handling, and large reports. Production bucket policy, credentials, and retention are unresolved; exports should remain disabled until configured and tested. Broad analytics are explicitly later scope. |
| Portal and role workspaces | **Not accepted end-to-end** | Programme Admin, Coordinator, Nurse Manager, Mentor, and Student workspaces and role routing are present. Recent focused ESLint/TypeScript checks pass for touched screens. | Run complete browser journeys at desktop and narrow mobile widths, including keyboard/accessibility, empty/error/loading states, and role denial. Current no-browser/no-listener state prevents acceptance. |

## Role-level readiness

| Role | Readiness | Critical remaining evidence or work |
| --- | --- | --- |
| Programme Admin | **Not accepted** | The acceptance report is source-level. Verify invitations/access/recovery, placements, directory/imports, content, reports, and exports against isolated programme data and denied actors. |
| University Coordinator | **Not accepted** | Institution isolation, cohort lifecycle changes, placements, reports, activity, invitations, and exports need database/browser acceptance. New cohort schema is unapplied. |
| Nurse Manager | **Not accepted** | Verify ward capacity, mentor assignment/reassignment, induction handoff, lifecycle, safeguarding review, and facility-only reports live. |
| Mentor | **Not accepted** | Verify multi-page roster, group session/offline reconciliation, induction batches, reminder handoff, and facility/scope boundaries. Latest batch migrations and live journey remain outstanding. |
| Student | **Not ready** | Anonymous feedback is disabled despite the approved requirement; resolve its privacy architecture. Then verify activation, acknowledgement, orientation, sessions, feedback/safeguarding, assessment, account and mobile journeys. |

## Ranked next work

1. **Unblock verification environment**: restore PostgreSQL and browser access, confirm free disk, then apply and record migrations. Do not infer test success from static checks.
2. **Resolve anonymous feedback privacy**: preserve the approved unlinkability promise across row timestamps, audit, idempotency, and outbox records. This is the clearest source-level MVP feature blocker.
3. **Run the complete golden journey and role denial matrix**: Coordinator → Nurse Manager → Student → Mentor → Student/reviewer, including failed requests, duplicate actions, and cross-tenant attempts.
4. **Close safeguarding governance**: set retention, operational owner, and restricted production data access before using real concerns.
5. **Close production operations for enabled features**: verify private content/export storage backup, restore, lifecycle retention, rollback, and email delivery observability.
6. After required gates pass, prioritize **session correction/follow-up workflow** and **learning/content governance** only if pilot users need them; richer analytics, automatic matching, passkeys, SMS MFA, and capacity negotiation are not core blockers under current requirements.

## Evidence limits

This is a source-and-record audit, not a new live module test. `sinaps health`
currently reports 7% free disk and Docker unavailable. Focused backend test
attempts fail during database setup because PostgreSQL is unreachable. No live
browser acceptance is claimed. Older verification notes record targeted or
partial passes; those do not replace the missing current full journeys.
