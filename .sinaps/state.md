---
project: mentor-mama
current_stage: VERIFY
tier: medium
tier_reason: User-visible learning-module creation bug spans the portal form and API serializer; no schema or authorization-boundary change.
last_updated: 2026-11-10T00:00:00Z
---

## Current session update — Concept-note audit of induction, feedback, session log and profiles (2026-11-10)

Audited against the developer concept note (§7-§11, Appendix A-C). Found and fixed: (1) no real induction checklist existed outside test seeds, so a fresh programme could not start inductions; added the eight concept-note items as an idempotent default (`seed_induction_template`, also run by `bootstrap_program_admin`); (2) student feedback was free text only and `unresolved_concern` was never written; rebuilt as the Appendix B form (5 ratings, knows-mentor, unresolved-concern + detail, one improvement) with server-side question whitelist, new `improvement_suggestion` column, surfaced to authorised reviewers; (3) baseline confidence was never collected, so confidence change was impossible; added baseline endpoint + 30-second student check-in; (4) mentor profile fields were missing; added optional `MentorProfile` (cadre, department, years of practice, mentorship experience, CPD identifier, digital literacy) with Account settings form; (5) session log topics and follow-ups lacked Appendix A options (ANC, newborn care, respectful maternity care, emergency preparedness; repeat demonstration, review reading, other). Not done, recorded in OPEN-QUESTIONS: consent capture (wording needed), anonymous instrument alignment, DOB minimisation, structured first-session date, confidence-change dashboard indicator.

Verified: backend suite and Ruff, portal tsc/ESLint/build; migrations applied to the dev DB. Not verified in a browser: the new feedback form, baseline card and mentor profile form.

## Current session update — Student sessions redesign, Menta greeting position (2026-11-10)

Menta greeting cause: the bubble was vertically centred beside the mascot, which rests at the bottom-right corner, so its lower half (greeting plus tip) fell below the viewport edge; on phones Menta also sat on top of the bottom tab bar. The bubble now opens above Menta (below it when Menta is in the top half), aligned to its outer edge with a matching tail, and on phones Menta rests above the tab bar. Student Mentorship sessions page rebuilt on the Programme Admin kit: stat cards, search plus type/placement filters, month-grouped session cards with topic chips, kit modal for details, calm empty/error states. Verified in real Chrome at 1366x768 and 390px (empty-data state); the populated list and detail modal were not rendered (no session data for that student). Portal tsc/ESLint clean.

## Current session update — Single source for placement progress (2026-11-10)

Cause: the Student journey, Admin steppers, status chips and "next step" copy each mapped placement state on their own. The Student journey had no completed/archived/withdrawn case, so a completed placement showed step 2 "Acknowledged" next to a "completed" chip and "record being prepared". Added `features/placements/placementJourney.ts` (state rank -> stages, progress label, status label, summary, `isPlacementClosed`) and moved the Student journey/detail/overview, both Admin steppers, Mentor student detail copy and Nurse Manager labels onto it. Backend: completed placements now reject mentor assign/reassign and ward allocation (`PlacementClosed`; previously only archived/withdrawn did); UI hides Change mentor/ward and bulk-reassign selection for closed placements. Verified: backend suite and Ruff, portal tsc/ESLint, real-Chrome render of the completed Student placement (all six stages done, one summary). Not verified visually: Admin/Coordinator/Mentor detail screens for completed and paused placements.

## Current session update — Content & training module lifecycle, scroll fix (2026-11-10)

Audit found: no unpublish/delete/duplicate/restore for content or modules (the library "…" button did one hard-wired action and refused modules); module archive did not exist; edits to live items silently unpublished them and the revision snapshot stored the NEW values; cover images were dropped on edit; duplicate titles caused 500s (slug uniqueness); quiz-free modules could never be completed (a required one blocked placement forever); admins could not open a draft module by id; audience was a single role (so "Programme staff" only reached coordinators); guides rendered only plain paragraphs to readers; authoring said "Create" while editing, showed a fake "Not saved" state, an always-green checklist and an empty fake outline.

Backend: `learning.0005` adds `TrainingModule.archived_at`; new endpoints content `unpublish|duplicate|revisions|DELETE`, modules `unpublish|archive(restore)|duplicate|complete|DELETE|admin GET`; unique slugs; revise snapshots previous state, persists cover, `keep_published`; delete only for non-live items (modules with learner records are archive-only); module payload now carries attempts/best score/learner counts. Frontend: shared lifecycle actions (confirm dialogs, keyboard menu), redesigned content detail (formatted guide reader, status banner, learner progress, version history), guided mentor training runner (outline, progress, retake, mark-as-read), multi-audience picker, live readiness checklist, heading tools, edit-aware save buttons ("Save changes" keeps live), save lands on the detail page, time-aware greeting on Mentor/Student/Nurse Manager (Nurse Manager was hard-coded "Good morning").

Scroll cause: page header blocks (detail pages, directory/placement records, account settings) plus Mentor log side panels were `position: sticky`, so 150-250px of every page was pinned under the portal header. Only the portal header is sticky now. Verified with real Chrome wheel-scroll on 11 role pages, detail, authoring and after closing a modal.

Verified: backend 4 new content + 3 new learning tests and full suite pass, Ruff clean, portal tsc/ESLint/build clean, content-authoring e2e passes (updated: save now lands on the detail page). Not verified: Student/Nurse Manager visual after greeting change, phone widths, delete/duplicate through the UI, Concept-note gap audit of induction checklist, feedback form, session log and profile fields (NOT done this pass).

## Current session update — Overlays, header, account settings and auth redesign (2026-11-10)

Added the shared overlay/field kit (`src/components/kit`: Modal, Drawer, DetailList, Field inputs) and moved every Programme Admin modal, drawer and detail page onto it: Invite, person drawer, status/edit access, recovery decision, add content, content detail, export, directory dialogs and CSV import (3-step with drag-and-drop), directory record detail, placement creation, lifecycle confirmations and a new admin placement detail with lifecycle stepper; phone card layout for admin placements. Fixed modal stacking (backdrops now cover sidebar and Menta). Added a shared sticky `PortalHeader` for all roles with a working "Search or ask Menta" command; fixed sticky being broken by `overflow-x: hidden`; compacted the sidebar footer so all items fit at 1366x768; fixed the wrong active sidebar item on account pages; removed legacy fixed-header clearance that pushed Mentor/Student content down. Redesigned Account settings (all roles) and all signed-out auth screens with motion and UX additions (OTP boxes, Caps Lock, strength meter, recovery-code actions). Fixed a latent strict-mode flake in content-module-authoring.spec.ts.

Verified: portal tsc, full ESLint and build clean; CI browser journeys (auth smoke 3/3, content authoring 1/1 x3, Menta 7/7) pass with system Chrome; screenshots of the redesigned screens at 1366x768 and phone widths against local data via temporary dev sessions, which were revoked. Not verified: authenticated MFA sign-in journey (needs E2E credentials), the live-data directory/placement acceptance specs (they mutate data), Pause/Withdraw/reassign dialogs and Edit access visually. The Mentor overview keeps its own extra internal top padding; other role dashboards still use their older visual language.

## Current session update — Programme Admin redesign, shared sidebar, portal-aware Menta (2026-11-10)

Design: added the Programme Admin design kit (`features/programme-admin/ui/AdminKit.tsx`, `admin-kit.css`) derived from the Content library page and moved Overview, Placements, Reports, People & access, Authenticator recovery, Programme setup (Identity/Directory/Access policy) and Activity onto it: one header, stat card, card, tab, toolbar, table, pill and button system with one radius and type scale. Fixed bare-text buttons, mixed pill/rectangle controls, word-valued stat cards and lowercase status labels. Added `features/workspaces/PortalSidebar.tsx` used by all five roles (sliding active indicator, Ask Menta card with Ctrl/Cmd+K, profile block, 1024px drawer); fixed the undefined `text-teal-bright` utility and the mismatched Student/Mentor drawer breakpoint. Each frame keeps its existing link/button semantics.

Menta: portal-aware answers from a server navigation registry (validated `[[go:id]]` actions), the user's own live status (`assistant/context.py`, no personal identifiers), 176 curated help sections, catalogue (programme-wide for content managers) and content passages with a minimum relevance score; `GET /api/v1/assistant/navigation`; frontend jump-to suggestions, reply navigation buttons, screen-aware suggestions, copy, tab-session persistence, outside-press close, wander bounds. Test settings now force AI off so a developer `.env` key can never be used by tests. ADR 0027 amended; design kit documented in `docs/ux/dashboard-design-system.md`.

Verified: backend 184/184 (clean run), Ruff clean, portal tsc/ESLint/build clean, Compose valid; Playwright (system Chrome, API mocked) Menta 7/7, content authoring 1/1, auth smoke 3/3; Menta spec added to CI. Live OpenAI check (gpt-4o-mini) answered training-catalogue, invite, navigation, cohort and clinical-refusal questions correctly after fixing two help-guide errors it exposed. Screenshots of all admin pages and every role's sidebar were taken against local data using temporary dev sessions, which were revoked afterwards. Not verified: real-browser journeys against the live API for non-admin roles, People/Setup dialogs visually, and mobile table layouts (Placements now scrolls horizontally on phones instead of using cards). Help guides need a product-owner review before the pilot. Import-linter still reports the 9 pre-existing broken contracts; none involve `apps.assistant`.

## Current session update — Menta AI buddy (2026-11-10)

Added `.env` AI variables (key left blank for the operator). Built Menta: `apps/assistant`
(grounded in role guides plus the asker's own published, role-scoped lessons/library items;
stateless; identifier guard; 40/hour throttle; ADR 0027), `GET /ai/status` now reports
`assistant`, and a portal-wide draggable/keyboard-movable floating widget
(`features/assistant/MentaBuddy.tsx`) that persists its position and becomes a bottom sheet
on phones. Verified: `tests/test_assistant.py` + `test_ai.py` pass, Ruff clean, portal
tsc/eslint/build clean, and a Playwright spec (`e2e/menta-buddy.spec.ts`, real Chrome, API
mocked) covering hidden-when-off, drag, clamping, reload persistence, Shift+Arrow, chat,
history, failure, Escape/focus return, and a 375px viewport. Not verified: a real OpenAI
reply (no key yet) and answer quality on real content.

## Current session update — OpenAI MVP integration (2026-11-10)

PM review of the full docs set and the uncommitted AI slice. Environment recovered
(15 GB free, Docker up; `mentormama-postgres` was stopped and was restarted), so
backend verification is possible again. Switched the AI slice from Qwen to the
OpenAI API for the MVP and presentation (ADR 0026 amended). Moved transport into
a feature-agnostic `apps/core/ai.py` (OpenAI Chat Completions, `max_completion_tokens`,
optional temperature for reasoning models, bounded timeout/input/output, content-free
logs, no secrets or HTTP bodies logged); `apps/learning/ai.py` now holds only the
lesson prompt, hardened with the no-clinical-advice boundary. Added
`GET /api/v1/ai/status` so the portal only offers "Explain this lesson" when AI is
live, per-lesson explainer state (fixes a shared-error bug), and a 429 message.
Added `manage.py ai_smoke_test`, dev/prod compose and env wiring (dev compose
previously passed no AI variables), and `tests/test_ai.py` (network always mocked:
request shape, disabled/keyless, failures without leakage, scoping: other programme,
unpublished, role-hidden, cross-module lesson). Full backend suite 150 passed, Ruff
clean on `apps tests`, portal `tsc` and ESLint clean, both Compose files validate.
NOT verified: a real OpenAI call (no key supplied), live browser rendering, and
import-linter (9 contracts were already broken before this change). Next: operator
sets `AI_ENABLED=true` + `AI_API_KEY`, runs `ai_smoke_test`, then a browser pass.

## Current session update — Learning module authoring repair (2026-11-09)

Root cause confirmed with a failing serializer regression test: multipart fields
`visible_roles`, `lessons`, and `quiz` are JSON strings. The serializer decoded
them, then wrote Python lists back into Django's `QueryDict`, which stringifies
those nested values and caused the API's HTTP 400 validation response. The
serializer now normalizes multipart input to a plain mapping before decoding.
Added serializer and authenticated API integration regressions. Restructured
lesson selection and actions as sibling controls, removing invalid nested
buttons and adding `aria-pressed`. Added a Chromium authoring journey to CI that
checks successful draft save, multipart payload fields, and absence of the
nested-button runtime warning. The focused serializer regression passed locally.
Hosted CI passed the multipart API integration and Chromium authoring journey,
along with Ruff, portal lint/typecheck/build, backend suite, Compose validation,
and all production image builds: run 42676089303. The UI journey mocks the API;
the backend test exercises the real multipart endpoint. Local browser
verification remains blocked by `sinaps health` at 7% disk free.

## Current session update — Managed VPS Docker production setup (2026-11-09)

Follow-up CI hardening: fixed Ruff findings and backend test regressions uncovered
by the first hosted run. Test settings now use local-memory cache when Redis is
disabled; anonymous-feedback and placement-pause assertions match the documented
privacy and date-clamping behavior. Replaced three overlapping workflows with
one required CI workflow covering backend checks/tests, web and portal lint/type
checks/builds, portal authentication smoke journeys, production Compose
validation, and production image builds. JUnit and browser diagnostic artifacts
are retained for 14 days, with a per-gate summary. Full authenticated portal
journeys remain outside the current browser smoke job because they require
deterministic role accounts and workflow-specific fixture state. First hosted
run validated backend Ruff, Django checks, migration drift, both
frontend gates, and Compose configuration. It exposed two stale authentication
assertions and an E2E assertion expecting HTTP 400 where the API intentionally
returns 401; those were corrected and pushed for a follow-up run. Production
image builds were skipped after upstream test failures. Follow-up hosted CI
passed all gates: backend Ruff, system checks, migration drift, and 133 tests;
web and portal lint/typecheck/build; three portal browser smoke journeys;
production Compose validation; and backend, web, and portal image builds. The
run is recorded at
https://github.com/JHUB-AFRICA/mentor-mama/actions/runs/42669864090.

Implemented the approved single-managed-VPS Docker Compose direction for the Django API,
public website, portal, PostgreSQL, Redis cache/broker, Celery worker/Beat, Caddy,
Prometheus, and Grafana. Added production Dockerfiles, private Compose networks, named
persistent volumes, Caddy TLS and API replica balancing, health checks, bounded JSON
container logs, an operational dashboard/alert rules, optional privacy-scrubbed Sentry,
production dependency pins, and a matched database/private-file backup script. Added the
VPS runbook, deployment plan, accepted topology ADR 0025, and production env template.
Moved unreferenced root screenshots into `docs/verification/reference-screenshots/` and
retained them. Added an authenticated private cover-image endpoint for persistent media.

Static source review only; no tests or image builds were run in this pass. Docker daemon
is unavailable in this environment. Upgraded the backend pins to Django 5.2.19 LTS,
DRF 3.18.3, and django-prometheus 2.5.0. Full dependency/security verification, staging
Compose validation, restore rehearsal, and operator choices for domains, backup policy,
alert delivery, and any external Sentry service remain before production launch. The single VPS remains one failure
domain; multi-host scaling requires shared database, cache, and file storage or an
orchestrator. Current stage remains BUILD pending VERIFY.

## Current session update — Coordinator verification attempt (2026-11-09)

Continued the Coordinator source audit and fixed related cohort/student flow issues: the dedicated Manage Students `deactivated` filter now works while the default roster remains scoped to invited/active/suspended accounts; overlapping cohort enrolment is rejected with a stable 409 after locking the scoped student row; archived cohorts no longer count as current assignment or appear in roster cohort names; successful enrolment invalidates roster and detail caches. Added focused API regression coverage and clarified the approved cohort UX. Portal targeted ESLint/TypeScript, Python compilation, Django system checks, and whitespace checks pass. Pytest cannot initialize PostgreSQL, so new assertions remain unexecuted; no browser target is available and disk remains at 7% free. Coordinator remains VERIFY / BLOCKED. Recorded functionality proposals in the verification report.

## Current session update — Previous Coordinator verification attempt (2026-11-09)

Refined the Coordinator Cohorts & Students roster from the supplied screenshot: search and cohort filters now share a compact toolbar, the table has cleaner proportions and semantic row actions, counts distinguish the filtered results from the stable institution total, summary read failures no longer appear as zero, and empty filtered results have accurate copy. Targeted ESLint and portal TypeScript pass. Adjacent source audit found a deactivated-student visibility mismatch between the Coordinator cohort UX and the separate Student Management filter; recorded in `docs/OPEN-QUESTIONS.md` without changing the privacy boundary. Live render verification remains blocked by the unavailable browser target and resource health. Coordinator remains VERIFY / BLOCKED.

## Current session update — Coordinator verification attempt (2026-11-09)

Continued Coordinator VERIFY from the prior handoff. Fixed the live-log regression in
`page_institution_students`: the `Exists`/`OuterRef` ORM expressions were used without imports. The existing
assigned/unassigned cohort-filter test covers the affected query. Django system checks, Python compilation of
the changed service, full portal ESLint, and `git diff --check` pass. The focused pytest module could not set up
because PostgreSQL is unreachable; migration inspection/application is similarly blocked. Docker socket access
is denied, and Argent reports no browser/device target. `lint-imports` still reports nine broken contracts.
Source-level inspection found institution scoping in roster/cohort selectors, placement exports, and placement
commands, but no runtime isolation evidence was produced. `sinaps health` remains BLOCKED at 7% free disk and
near-full swap. Coordinator remains VERIFY / BLOCKED; see
`docs/verification/coordinator-verification-2026-11-09.md`. Next action: restore authorized local PostgreSQL/
Docker and browser access, then rerun migrations, focused and full backend suites, boundary checks, and the
cross-institution Coordinator journey before a fresh adversarial review.

## Current session update — Previous Coordinator verification attempt (2026-11-09)

With explicit authorization to proceed under the available resources, applied migrations and confirmed no pending
migrations or model drift. Full portal lint now passes after fixing the two known `prefer-const` errors. Focused
Coordinator authorization, institution scope, invitations, placements, and export checks pass. The full backend
suite reports four failures outside this slice: intentionally disabled anonymous feedback, two stale auth response
expectations, and a pause-date assumption. Import-linter reports nine existing broken architecture contracts.
No browser target is available, and `sinaps health` remains blocked at 7% disk free with high RAM/swap pressure.
Coordinator remains VERIFY / BLOCKED; see `docs/verification/coordinator-verification-2026-11-09.md`.

## Current session update — Coordinator verification gate (2026-11-09)

Led the requested security, full-validation, edge-case, and adversarial-review preparation. The two known
portal `prefer-const` lint failures were fixed and the affected acceptance file passes scoped ESLint. Focused
Coordinator authorization/institution tests, portal TypeScript, production build, and whitespace checks pass.
Full migrations, backend suite, import-boundary checks, and live browser security/edge-case journeys remain
blocked by `sinaps health`: disk is 7% free, RAM is 86% used, and swap is almost full. Verification is recorded
in `docs/verification/coordinator-verification-2026-11-09.md`; do not mark the Coordinator actor complete until
the resource environment is repaired and the remaining gates are rerun.

## Current session update — Coordinator single-student invitations (2026-11-09)

Added a Single student invitation mode alongside batch roster upload. The single form collects required
email, first name, last name, and registration number plus optional phone, then sends the same one-row dry-run
review through the existing institution-scoped bulk invitation contract before delivery. Batch behavior remains
unchanged. Invitation/auth tests, portal TypeScript, production build, and whitespace validation pass; live
browser acceptance remains pending.

## Current session update — Coordinator functionality audit (2026-11-09)

Audited Coordinator Overview, Cohorts & Students, Reports, Activity, Placements, and Placement Detail against
the institution-scoped authority matrix. Fixed inaccurate collapsed lifecycle reporting, added a recoverable
placement-detail load failure state, included paused placements in lifecycle progression, and made the enrolment
dialog searchable so large institution rosters are not limited to the first loaded page. Existing Coordinator
actions remain capability/state governed. Focused institution/placement authorization tests, portal TypeScript,
and production build pass; live browser acceptance remains pending.

## Current session update — Coordinator cohorts and students hierarchy (2026-11-09)

Restructured the Cohorts & Students screen into two clearly separated work areas. Student actions now sit with
the institution roster: manage students, invite students, search, and add to a cohort. Cohort creation now sits
with the Planning Groups section, which has its own visual boundary and action. Preserved institution scope,
student pagination, enrolment behavior, and existing loading/error/empty states. Portal TypeScript, focused
cohort/enrolment tests, production build, and whitespace validation pass; live visual acceptance remains pending.

## Current session update — University Coordinator overview hardening (2026-11-09)

Read the Coordinator role, authorization matrix, placement handoff contract, and Overview audit before editing.
The Coordinator is institution-scoped: they create/release placements, manage cohorts and students, monitor
progress, review approved signals, and report; ward allocation, mentor assignment, induction, session logging,
and completion remain outside their authority. Fixed the Overview's false healthy queue during indicator failure,
added explicit loading/error states, expanded the placement pipeline to all institution lifecycle stages, and
surfaced setup/release and paused placement attention items. Coordinator API regressions, portal typecheck,
coordinator error scan, and production build pass. Live browser acceptance remains pending.

## Current session update — Nurse Manager table pagination (2026-11-09)

Added a shared accessible pagination control and wired it into Nurse Manager Activity, Mentor Operations,
Placement Operations, Ward Operations, and Report Exports. Activity now requests server pages instead of always
loading page one; filters reset to page one, and ward/export lists paginate their existing scoped responses.
Portal TypeScript, scoped ESLint, production build, focused facility/Nurse Manager backend tests, and
`git diff --check` pass.

## Current session update — Nurse Manager ward table redesign (2026-11-09)

Replaced the ward-operation card list with a responsive comparison table covering ward, shift pattern,
occupancy, open capacity, visible placements, and the scoped placement-register action. The summary remains
compact and the mobile layout uses horizontal overflow so operational columns stay legible. Focused
facility/ward/Nurse Manager tests, portal TypeScript, and portal production build pass; live visual acceptance
remains pending because no browser target is available.

## Current session update — Nurse Manager dashboard audit (2026-11-09)

Read the approved Nurse Manager role, authorization, lifecycle, API, and UX contracts before implementation.
The actor is facility-scoped with ward as a filter: they assign/reassign mentors, operate placement lifecycle,
monitor induction and sessions, review authorised concerns, and export facility reports. Fixed dashboard and
placement breakpoints: the attention queue now loads the maximum scoped page and uses server pagination metadata;
empty analytics projections no longer overwrite live counts with false zeros; terminal placements no longer show
assignment actions; facility identity failures expose retry instead of a generic fallback; and lifecycle panels
show a truthful empty state when capability gating hides all transitions. Focused dashboard and Nurse Manager API
tests, portal TypeScript, Python compilation, and whitespace checks pass. Live browser acceptance remains pending.

## Current session update — Mentor notifications, training, and session logging (2026-11-09)

Added ownership-safe mark-all-read notifications, expanded and validated mentorship session types/topics,
made "what was covered" required, and blocked the mentor session selector for active placements past their
effective end date. Refined the mentor training workspace with progress, module metadata, clearer lesson and
quiz hierarchy, and completion states. Generated mentorship migration `0005_alter_session_session_type`.

Focused notification/session API tests, session invariant tests, Python compilation, portal TypeScript, and
portal production build pass. Portal-wide lint remains blocked by two pre-existing `prefer-const` errors in
`apps/portal/e2e/directory-create-acceptance.spec.ts`. Live browser acceptance remains pending because no
browser target is available; this remains VERIFY / MAJOR.

## Current feature

Managed VPS Docker production setup Implement production containers, reverse proxy load balancing, local monitoring, and safe operational defaults for a managed VPS.

## Current session update — Mentor batch workflow and induction design (2026-11-09)

Reviewed Mentor routes, placement scoping, lifecycle actions, induction,
notifications, and session persistence. The original log form wrote one session
per placement and the Mentor shell loaded only the first 12 placements. Added
multi-page Mentor roster loading, attendance selection (up to 100 per command),
atomic idempotent session batches with individual placement records, offline
batch preservation, duplicate reporting, and clear shared-note guidance.

Added mentor group induction for students attending the same handoff, grouped
by checklist version. Each answer and signature is persisted against each
student's own checklist; sign/activate is all-or-nothing. Added an idempotent
batch orientation reminder request. The Student still performs their own
orientation acknowledgement. Orientation now points the Mentor to induction;
after induction, the next action is session logging. Reworked checklist
language and visual styling to match the Mentor workspace. Individual student
detail also checks orientation status, explains who owns the next step, and
prevents a premature induction request. Added ADRs 0023 and 0024 and a
verification record.

Portal production build and scoped ESLint pass. Python compilation,
`git diff --check`, and `makemigrations --check --dry-run` pass. Portal-wide
ESLint still reports two `prefer-const` errors in the unrelated
`e2e/directory-create-acceptance.spec.ts`. Targeted Django API tests cannot
start because PostgreSQL is unavailable. No Argent browser target is running,
so the updated screens have not had live visual acceptance. Apply mentorship migration
`0004_sessionbatch_session_batch_sessionbatchresult_and_more` and induction
migration `0003_mentor_induction_batch`, then rerun API tests and the documented
30+ student acceptance journey before marking the Mentor actor ready.

## Current session update — Student actor source readiness review (2026-11-09)

Traced the Student routes through API clients and server capabilities/services.
Profile, placement review/acknowledgement, orientation hand-off, session
history, role-visible library reads, confidential feedback, safeguarding,
final assessment, and account/security surfaces have source implementations.
Student acceptance remains open: anonymous feedback required by POL-014 is
disabled until an unlinkable idempotency/audit/outbox design is implemented;
live desktop/mobile/API journeys and migration `placements.0007` remain
unverified. Review matrix: `docs/verification/student-actor-readiness-2026-11-09.md`.

## Current session update — Student workspace spacing (2026-11-09)

Student routes placed `.student-page-container` inside `.workspace-content`,
so both layers applied width constraints and padding. That doubled the page
gutters and pushed the content down. The shared frame now marks Student
content, tightens its top inset, and removes the nested container's duplicate
padding while widening its desktop reading area. This applies consistently to
Student overview, placements, sessions, library, and settings routes. A live
layout check remains pending because there is no browser target available.

## Current session update — Student placement signing and lifecycle gates (2026-11-09)

The supplied screenshots exposed three source defects: final assessment used
only the placement end date and appeared during Orientation; placement
acknowledgement was a checkbox-only transition with blank signature/date lines;
and shared Library/Settings styles loaded only with the Programme Admin frame.

Final assessment now requires Active or Paused lifecycle status plus the
effective end date in both status and submit services, with a matching Student
UI gate. Student acknowledgement now requires typing the account name and
persists that name with a server-generated timestamp atomically with the
placement transition. A database trigger makes the acknowledgement immutable;
the assignment can then be reopened read-only. Shared workspace styles now load
at portal startup. Added ADR 0022 and a numbered acceptance journey.

`sinaps health` remains BLOCKED at 7% free disk; Docker, app listeners, and
runtime processes are unavailable, and Argent reports no Chromium target. No
migration, build, API, or browser verification was run. Current stage remains
VERIFY / MAJOR. Existing progressed placements without a signed record are not
backfilled with invented name/date data.

## Current session update — Student acceptance source pass (2026-11-09)

Fixed Student/Mentor library detail routing, role-scoped training reads and
cache keys, non-admin content actions, the Student mobile Library link, and
placement-detail state reuse when switching placements. Account settings now
show the signed-in user's role, avoid a fabricated programme name/security
claim, expose unavailable notification/security reads with retry, and use a
stable app-level error callback to prevent failed reads from looping. Final
assessment, feedback, and safeguarding retries keep the same idempotency key
unless the user changes the submission.

Found a blocking privacy divergence: anonymous feedback's inherited exact
timestamps plus actor-linked audit/idempotency records and a feedback-ID outbox
event allow correlation despite ADR 0008. Tracked in `docs/OPEN-QUESTIONS.md`
and documented in `docs/verification/student-flow-03-library-feedback-assessment-account.md`.
The approved anonymity contract remains unchanged; Student acceptance cannot
close until these surrounding records are made unlinkable.

Until that design is implemented, anonymous feedback now fails closed with a
plain-language API response and is disabled in the Student form. Feedback and
safeguarding submit buttons prevent concurrent repeat clicks, the account page
no longer makes a static account-active claim, and final-assessment success copy
names the saved information. This is a safe interim behavior, not completion of
anonymous feedback.

`sinaps health` reports Docker unavailable, no listeners, and 7% free disk, so
resource-heavy builds and real-browser/API journeys remain blocked. This remains
VERIFY / MAJOR. No E2E completion is claimed.

## Current session update — Django startup CSRF check (2026-11-09)

Fixed the Django 5.0.14 `security.E101` startup failure: its CSRF check binds
the handler with the keyword `reason`, so the handler parameter now uses that
name. `python manage.py check --tag security`, Python compilation, and
`git diff --check` pass. This is a one-line SMALL startup fix; no database
migration or container image rebuild is required because Compose bind-mounts
the backend source. The broader project remains VERIFY / MAJOR for the
previous auth and persistence work; real API startup and Student flow acceptance
still depend on the local containers and browser.

## Current session update — Student placement/orientation and session history (2026-11-09)

Sign-in now distinguishes a correctly authenticated suspended/deactivated
account from an incorrect password. Incorrect credentials still receive the
same generic 401; account status is disclosed only after password verification,
and no session is created for an inactive account. The user-facing message says
that password reset will not restore paused access and directs the person to
their Programme Administrator.

Student orientation acknowledgement can be read after navigation/reload and
retries do not create duplicate acknowledgements or events. Student session
history now preserves records from placements that responded when another
placement request fails, explains the list may be incomplete, and offers retry.

Scoped portal TypeScript and ESLint, Python compilation, and whitespace checks
pass; targeted API integration tests remain unverified because PostgreSQL is
unavailable. There is no live browser target, Docker is unavailable, and disk
space remains below the verification gate. The verification record is
`docs/verification/student-flow-02-placement-review-orientation.md`. Continue
with Student learning library and session details, feedback/safeguarding, and
endline assessment after this slice; do not claim the Student role accepted
until API-backed desktop/mobile journeys pass.

## Current session update — Auth feedback and Student account setup (2026-11-09)

Unified auth requests through the shared API error handler, replacing raw
browser fetch errors with plain-language retry guidance and masking malformed
or server-error response content. Unexpected API exceptions, unmapped database
integrity failures, and internal domain errors are logged on the server and
returned as generic retryable 500 responses; API CSRF failures return a stable
JSON 403, and Django HTML error pages on API URLs are converted to safe JSON.
Incorrect credentials for active and suspended accounts share a generic 401
response. Correct credentials for a suspended account receive a clear access
paused response without establishing a session.
The auth artwork has a graceful fallback, invite copy describes conditional
account security steps accurately, incomplete activation links show recovery,
and Student profile fields required by the workspace gate are visibly marked
and enforced in the form.

Scoped TypeScript, ESLint, Python compilation, diff whitespace checks, and the
new safe-error handler unit tests pass. The login integration test could not
connect to PostgreSQL. Argent has no running browser; Docker is unavailable and
disk is 7% free, so end-to-end auth and Student journey acceptance remains
pending. The verification record is
`docs/verification/auth-feedback-and-student-account-setup-2026-11-09.md`.
Current stage remains VERIFY, tier MAJOR; neither auth nor the Student role is
complete. Resume with a live invitation-to-profile journey when services are
available, then continue the Student journeys listed in the latest update.

## Current session update — Admin data integrity and Student flow 01 (2026-11-09)

Fixed the Activity details crash caused by structured audit values being
rendered as React children; both Programme Admin and Coordinator activity now
format scalar, array, and object values safely. Admin dashboard/report counts
were traced to their API selectors. Placement lifecycle analytics now include
all ten states from the live programme-scoped register, avoiding a mismatch
between pie slices and total and avoiding the five-minute projection for Admin
counts. Missing-setup attention excludes completed/archived/withdrawn records.
People totals now disclose that the current admin is excluded; report KPIs no
longer imply an unapproved completion percentage. The dashboard’s library
counts now include modules and use actual record statuses; mutation paths
invalidate the summaries they affect. Failed content reads no longer present a
complete attention summary as if it were zero.

Started Student flow 01: profile check failures are distinct from incomplete
profiles and retry without clearing saved values; placement confirmation now
has loading, unavailable, not-ready, failure, and success handling. The
acceptance contract is recorded in
`docs/verification/student-flow-01-profile-and-placement-confirmation.md`.

Scoped portal ESLint, TypeScript, backend Python compilation, and
`git diff --check` pass. Browser/API journey verification remains pending due
the unavailable Docker/browser environment and low disk gate. Programme Admin
is still VERIFY, not complete. Continue the Student flows after the Admin live
acceptance gate; user has asked to proceed role-by-role.

## Current session update — Programme Admin acceptance/reporting/release pass (2026-11-08)

Corrected reporting month options to a rolling twelve months, made the daily
event chart label and empty state match its data, and removed placement
interruption rows from Safeguarding reporting. The reporting decision now names
the Programme Admin pilot views and defers historical state/cohort trends and
unapproved exports. Admin completion feedback now uses toasts for invitations,
people/access, recovery, placement, directory, content, activity refresh, and
report actions. Recovery audit and notification enqueue behavior was traced in
the service and email handler. Added private document volume backup/restore,
retention, and rollback steps plus a section-by-section acceptance record.

Scoped ESLint, portal TypeScript (`tsc --noEmit`), and `git diff --check` pass.
Full API,
migration, notification-delivery, browser permission/error, and desktop/mobile
acceptance remain pending: Docker and browser targets are unavailable and free
disk is below the verification gate. This remains VERIFY; do not mark
Programme Admin complete. Next action is to run the acceptance gate documented
in `docs/verification/programme-admin-acceptance-2026-11-08.md`. Student is the
next role only after that gate passes.

## Current session update — recovery authority and content uploads (2026-11-08)

Programme Admin recovery requests are now omitted from their own programme
inbox. A dedicated recovery page uses the Content Library table and summary
style. Platform recovery is available only through Django Admin to active
superusers with an MFA-verified, valid session; decisions require a reason and
are audited. Document authoring accepts PDF, DOCX, and PPTX uploads up to 20 MB
or an existing managed link. Uploads are signature-checked, stored in a private
Compose volume, and downloaded through an authenticated programme/audience
scoped endpoint. A new content migration and ADR document data impact and
rollback.

Scoped ESLint, TypeScript (`tsc --noEmit`), Python compilation, and
`git diff --check` pass. Django migration consistency could not be checked
because Django is not installed in the host environment. The full suite and
browser journey were not run; `sinaps health` reports 8% free disk and Docker
unavailable, and there is no running browser/CDP target. Reports still state
clearly that placement trend history and additional report read models are not
available yet; no fake data was introduced. Next action: apply the migration in
the local Docker environment, verify both recovery paths and protected download
as different roles/programmes, then render the page at desktop and mobile widths.

## Current session update — 2026-10-01 (Phase 3 acceptance follow-up)

The authenticated Getting started state was rendered against an isolated,
temporary programme with active directory scopes but no operational leads and
no pilot-coverage attestation. At 375 px, both role-specific invitation
shortcuts appeared; Coordinator selected the sole institution, Nurse Manager
selected the sole facility, and the page had no horizontal overflow. No invite
was submitted in this browser run. The temporary programme, admin, MFA device,
and test artifacts were removed; pre-existing E2E accounts and programme were
not changed.

Email delivery and recipient activation remain unaccepted. The local API has
Mailtrap Sandbox credentials, but `config.settings.dev` deliberately pins email
to the console backend. An attempt to continue with an activation message to
the third-party Mailtrap Sandbox was rejected by automatic approval review
because it contains an activation credential and the user had not explicitly
approved that specific external payload. No message was sent. The exact
approval boundary and safe continuation are recorded in
`docs/ux/screens/45-programme-admin-first-use-live-test.md`.

## Current session update — 2026-10-01

The local PostgreSQL/API/Redis services are available. Read-only migration
inspection confirms directory migrations through
`identity.0013_program_directory_review`,
`institutions.0003_institution_directory_contacts_logo`, and
`facilities.0003_facility_directory_contacts_logo` are applied; there is no
directory-import migration because imports add no tables. The machine remains
at 3% free disk after the user-approved Docker builder cache prune, below the
Sinaps verification gate. The user then explicitly authorized proceeding
despite that block. The local portal production build passes. Three Playwright
auth smoke checks pass using installed system Chrome. A separate Programme
Admin account passed authenticated local acceptance for password + TOTP login,
identity save/reload persistence, and institution, facility, and ward detail
navigation. Remaining write, capacity/review, keyboard, and responsive checks
are listed in the Phase 2 acceptance update at the end of this file.

The Programme Directory CSV import placeholder has been replaced in source by
type-specific institution, facility, and facility-scoped ward templates,
preview, row validation, duplicate warnings, and idempotent all-or-nothing
commit. Writes delegate to the existing domain services, preserving row-level
audit and coverage invalidation. Preview tokens are bound to actor, programme,
file, directory snapshot, and validation results. No uploaded file is retained;
contact details are excluded from batch audit data and logo import remains out
of scope. Design and HTTP contracts are in
`docs/architecture/directory-import-design.md`.

Institution, facility, and ward rows now link to URL-addressable detail screens
inside Programme setup. Details reuse the programme-scoped directory queries and
existing edit/archive APIs, show current contact/logo and ward capacity data,
link related facility/ward records, and offer pre-scoped ward creation. Responsive
detail layouts and loading/error/unavailable/empty states are implemented. The
UX contract is `docs/ux/screens/48-programme-directory-record-details.md`.
The supplied screenshot predates the CSV-import UI update, so it is not evidence
of the current source. Argent reported no running browser/device target. The
browser smoke suite used Playwright with installed system Chrome; authenticated
visual, keyboard, and narrow-screen acceptance remains pending.

## Approved artifacts

- [x] docs/product/problem.md
- [x] docs/product/requirements.md
- [x] docs/architecture/architecture.md
- [x] docs/architecture/decisions/0015-role-owned-portal-workspaces.md

## Open questions

| Question                                                                   | Blocks            | Raised     | Status                                                                                                                                  |
| -------------------------------------------------------------------------- | ----------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Escalation-content retention period                                        | SHIP              | 2026-08-24 | open                                                                                                                                    |
| Whether evaluation needs a stable pseudonymous student identifier          | SHIP              | 2026-08-24 | open                                                                                                                                    |
| Whether coordinators may read session free text when an escalation is open | Feedback scope    | 2026-08-24 | open                                                                                                                                    |
| Whether email is the required identifier for every pilot role              | AUTH ARCHITECTURE | 2026-08-24 | resolved: email is the pilot identifier; phone is profile/contact data only                                                             |
| Which roles require MFA before first product access                        | AUTH ARCHITECTURE | 2026-08-24 | resolved: programme admin, coordinator, and nurse manager required; mentor/student optional; TOTP plus recovery codes                   |
| Who may invite, suspend, deactivate, and recover each role                 | AUTH ARCHITECTURE | 2026-08-24 | resolved: approved authority matrix; programme admin is separate from operational/system admin                                          |
| Invitation expiry, resend, and session timeout policy                      | AUTH ARCHITECTURE | 2026-08-24 | resolved: 48h invitation; previous token invalidated on resend; max 3 resends/24h; 12h inactivity and 7-day absolute session lifetime   |
| Transactional email provider and sandbox                                   | VERIFY            | 2026-08-24 | resolved: Mailtrap Sandbox for development/QA/staging; Mailtrap Email Sending for production behind an internal email service interface |

## Current session update — Programme Admin visual consistency pass (2026-11-08)

Programme Admin pages now share the Content Library reference scale and framing: a
75rem page width, 36px desktop/32px small-screen headings, consistent white cards,
thin borders, 12px corners, and compact card padding. The Overview is now a
task-focused heading without the decorative promotional panel. People & access
now starts with a clear heading and invitation action; report, activity, setup,
content, directory detail, account settings, and placement pages inherit the
shared sizing. The acceptance contract is documented in
`docs/ux/screens/49-programme-admin-page-consistency.md`.

Scoped ESLint, TypeScript, and `git diff --check` pass. `sinaps health` reports
8% free disk and blocks resource-heavy verification. Argent found no running
Chromium/CDP target, so this pass has not had a production build or rendered
visual review. Next action: run the portal build and inspect desktop/mobile views
when the project volume has sufficient free space and a Chromium target is
available.

## Last session summary

Programme setup now collects optional institution/facility contact person,
email, phone, and partner logos. Logo uploads accept validated PNG/JPEG/WebP
images up to 2 MB and 4096 pixels; the directory supports preview, replacement,
and removal. Public partner display is explicitly deferred pending consent and
production media/publishing policy. Setup progress now checks active identity
and active institution/facility/ward records, while clarifying that record
presence does not confirm pilot coverage. Ward capacity controls now explain
their hard-limit role; safe capacity-reduction enforcement remains pending at
the placement module boundary. Training-policy help text now matches the
release-time guard. These
changes are source-complete but have not received live browser or build
verification because the machine health gate remains blocked at 2% free disk.
See ADR-0017 and `docs/ux/screens/46-programme-setup-directory-upgrade-proposal.md`.

The Nurse Manager workspace now has a facility-specific shared shell with an
Operate group (Overview, Placements, Mentors, Wards & capacity), a Review group
(Safeguarding, Reports, Activity), explicit Account & security access, facility
scope in the header, responsive off-canvas navigation, skip-to-main support,
keyboard focus treatment, notifications, and account menu behavior. Existing
facility Overview, placement management, mentor onboarding, and account settings
are routed through the shell. Placeholder routes establish the remaining page
surfaces for the next implementation slices. Portal lint, TypeScript validation,
production build, and diff validation pass. Mentor register/detail lifecycle
management and the remaining facility page data contracts are still required.
Browser verification is pending because `sinaps health` reported 11% free disk
space and blocked the verification gate; no cleanup was performed.
The Manager shell was then corrected to use the actual MentorMAMA dark logo
asset and a fixed facility header with desktop rail offset and reserved content
space. Portal lint, TypeScript, production build, and diff validation pass.
The Manager Overview was redesigned around the first-login sequence of scope,
attention queue, ward capacity, mentorship pulse, placement pipeline, and safety
monitoring. UX contract is documented in `docs/ux/screens/41-nurse-manager-overview.md`.
Authenticated browser verification remains blocked in this session: PostgreSQL
is unreachable, Docker access is unavailable, and the Vite dev server cannot bind
to the requested host in the current sandbox.
The Overview was refined after rendered review: the hero is now a compact context
band and the operating indicators are separate square cards with individual
labels and supporting descriptions. The page now prioritises the attention queue,
capacity, mentorship pulse, pipeline, and safety monitoring. Portal lint,
TypeScript, production build, and diff validation pass. Live authenticated
verification remains unavailable because the local PostgreSQL service is not
reachable and the existing browser target is not exposed through CDP.

Student lifecycle hardening is now implemented for the current portal slice. The
authenticated activation redirect maps every supported role to its canonical
workspace. Students can opt into TOTP MFA from Account > Security, while the
existing mandatory MFA flow remains enforced for programme admins, coordinators,
and nurse managers. Student first access now presents a branded blocking profile
completion modal; the gate links to a dedicated `/student/profile` page in the
student workspace shell. The page reuses the protected profile/contact contract
and completion state is refreshed after save. Student More links now target the
dedicated profile page. The student overview recent-activity timeline was also
refined into a contained activity panel with clearer event hierarchy, date
treatment, and responsive layout. Portal TypeScript, ESLint, production build,
Python compilation, and diff checks pass. Live authenticated browser regression
remains pending because the verification browser/CDP and local service
constraints recorded above are still unresolved.

The authenticated router now enforces role-specific URL prefixes at the client
boundary: unsupported role paths redirect to the user’s canonical workspace,
while intentionally shared placement and account routes remain available only to
the roles that own them. This complements server-side authorization and prevents
cross-role workspace surfaces from rendering through permissive fallback paths.
The portal TypeScript, ESLint, production build, Python compilation, and diff
checks pass after this change.

The dedicated student profile route now renders a profile-only account surface
instead of the full multi-tab settings view. It provides a focused heading and
separate identity, programme, and emergency-contact cards while retaining the
existing protected update handlers and completion callback. Portal TypeScript,
ESLint, production build, and diff checks pass.

Student overview activity now distinguishes loading, failed, and genuinely empty
history states. Failed activity requests expose an inline retry action instead of
silently presenting an empty timeline. Portal TypeScript, ESLint, and diff checks
pass after this refinement.

Coordinator institution operations are now extended beyond student management. A dedicated cohort detail view shows the institution cohort roster, capacity and availability with links to student management and invitations. Bulk placement requests now have a coordinator-scoped batch activity list and durable batch detail view with polling, created/skipped outcomes, and failure visibility. The placement batch API exposes scoped list metadata and planned windows. Portal lint/build and Python compile checks pass; after a dev-server module cache, reload/restart the portal dev server if it still reports the removed shared EmptyState import.

Cohort and student management usability is now strengthened: cohort records are fully interactive and open detail from the whole row, student records expose a clear details affordance, and active coordinators can suspend a student from the institution-scoped details drawer with explicit confirmation while retaining history. The cohort detail header now uses the coordinator dark-navy hero treatment and provides the permitted invitation and student-management actions. Portal lint and TypeScript checks pass.

Suspended/deactivated student recovery is now explicit in the coordinator drawer. Because the authority matrix correctly prevents coordinators from reactivating accounts, the UI identifies the Programme Administrator as the recovery owner, explains that history is retained, and removes ambiguity about the next step.

Account suspension/deactivation email delivery is fixed. The security outbox dispatcher previously required an active recipient, so it skipped the notification after the account status had already changed and incorrectly marked the outbox item delivered. Suspension/deactivation notices now dispatch for the affected non-active account; other security notices remain active-account-only. Identity invitation, password/MFA, placement, mentor, safeguarding, feedback, session, and assessment event mappings were reviewed for equivalent notification gaps. Python compile, portal lint, and diff checks pass.

Coordinator placement operations are accepted for the current pilot slice. The coordinator register supports institution-scoped search, lifecycle, cohort, and facility filters; bulk placement creation has durable batch list/detail tracking; placement detail shows lifecycle/progress, release, pause/resume/withdraw controls, controlled-reason confirmation, and success/error feedback; role boundaries keep ward/mentor allocation and completion with the operational roles. Lifecycle events now route safe notifications to active student/mentor participants. Coordinator verification passes portal lint, TypeScript, Python compile, and diff checks. The next role may proceed; broader production launch gates remain separately tracked in the domain status table.

Coordinator acceptance checklist follow-up: activity now supports institution-scoped student/cohort/placement/action/date filters with date-range validation. Bulk placement logic was verified against active overlap conflicts, historical terminal placements, and partial skips. Final manual responsive, keyboard/screen-reader, and dedicated end-to-end browser regression evidence still needs to be run before calling the role fully shipped.

The first portal slice and backend foundation are in place. Authentication backend
foundation is now implemented for invitation issuance, activation, cookie login/
logout, password reset/change, account-status enforcement, and transactional-email
outbox dispatch. Mailtrap API integration is configured: Sandbox is selected with
`MAILTRAP_SANDBOX_ID`; production is selected without it. The identity migration
is applied on PostgreSQL port 5433. The focused auth suite and full backend
regression suite pass, and one controlled Mailtrap Sandbox API delivery test
succeeded. Redis/Celery background processing, the one-time Programme Admin
bootstrap, the Django architecture-boundary refactor, MFA enrollment/challenge,
browser-session inventory/revocation, account-status session revocation, and
basic MFA device/recovery management, password-reset session invalidation, and
audited Programme Admin MFA recovery are implemented and focused-tested.
Next auth slice: recovery escalation policy and full user-facing account
management journeys. Portal authentication journeys are now implemented and
portal lint/build pass. The Programme Admin overview shell is now implemented
with a responsive off-canvas navigation rail, contained hero artwork, metric
cards, and setup actions; see docs/ux/screens/18-programme-admin-overview.md.
The overview’s invitation action is now connected to the protected invitation
endpoint through a focused, responsive team-member modal with success/error UX.
The People view now uses a server-paginated `/api/v1/people` contract and a
responsive table with search, role/status filters, loading, empty, error, and
pagination states; see docs/ux/screens/19-programme-people.md.
People row lifecycle actions are now connected: invitation resend, suspend,
deactivate, and activate, with server-side authorization and session revocation
on non-active status changes.
The People experience now uses a branded status confirmation dialog and a
responsive person details drawer instead of browser-native confirmation or a
separate page navigation.
The Activity view is now connected to a programme-scoped paginated audit API and
renders a responsive timeline with safe expandable change details; see
docs/ux/screens/20-programme-activity.md.
Shared loading primitives are now available in `@mentormama/ui`: layout-preserving
skeletons for People/Activity and a branded blocking spinner overlay for secure
session checks and invitation submission; see docs/ux/loading-and-feedback.md.
The dashboard Overview cards now read live programme counts from a dedicated
scoped summary endpoint and show skeleton values while loading; see
docs/ux/screens/21-programme-dashboard-summary.md.
The summary now includes actual audit-event totals for the Activity card and an
inline retry state for failed summary requests.
The first Programme Settings slice is now implemented: active Programme Admins
can view and update the programme name through a scoped API, with audit logging,
skeleton loading, and blocking save feedback; see
docs/ux/screens/22-programme-settings.md.
Programme Directory configuration is now started: Programme Admins can list and
create programme institutions and facilities through module-owned, scoped APIs
and a Directory tab in Programme Settings; see
docs/ux/screens/23-programme-directory.md. Wards and deeper access policy remain
open in this admin track. Invitation scope assignment is now implemented: the
invite modal loads programme institutions/facilities, selects the correct scope
based on role, and blocks submission when no scope is configured. Identity
validates role/scope consistency and programme ownership through institution and
facility module services; see docs/ux/screens/24-invitation-scope-assignment.md.
Coordinator-scoped student onboarding is now implemented as a CSV preview/send
flow: active University Coordinators can validate up to 500 rows and queue
invitations that inherit their institution scope; see
docs/ux/screens/25-coordinator-student-import.md. Richer cohort management
remains a later institution-domain slice.
Facility-side mentor onboarding is now implemented with the same reusable CSV
preview/send flow: active Nurse Managers can invite up to 500 mentors, each
inheriting the Nurse Manager’s facility scope; see
docs/ux/screens/26-nurse-manager-mentor-import.md.
PostgreSQL and Redis were started from docker-compose.dev.yml for verification.
The full pytest suite and focused identity authentication suite pass when run
with host-network access; sandboxed pytest attempts fail only because the
sandbox cannot reach localhost:5433. Post-verification health remains usable;
disk is at 16% free and recorded as a warning.
The first institution-domain slice is now implemented: Coordinators can create
cohorts and enrol students from their own institution through module-owned
services and versioned APIs; see docs/ux/screens/27-coordinator-cohorts.md.
Placement creation and facility allocation remain separate placement-domain
workflows.
The SPA no longer probes protected `/me` and `/placements` endpoints while signed
out: `GET /api/v1/auth/session` now returns a safe authenticated/anonymous state,
and protected data loads only after an authenticated result. An executable
Playwright suite was added under `apps/portal/e2e/` with managed Chromium and
passes signed-out and Programme Admin MFA journeys; see the portal `e2e` script.
Account enhancements are now implemented: per-user notification preferences with
security alerts locked on, a Programme Admin access-policy review surface backed
by the server capability matrix, and richer session/device inventory UX with
refresh, expiry/IP details, empty state, and revoke confirmation; see
docs/ux/screens/28-account-enhancements.md.

Authentication & Account Management is complete for the pilot. The verified
surface includes invitation activation, password creation, cookie sessions,
login/logout, password reset/change, CSRF-safe public boundaries, role and scope
authorization, mandatory TOTP MFA for Programme Admin/Coordinator/Nurse Manager,
QR setup and recovery codes, MFA-pending session handling, session revocation,
account status enforcement, invitation outbox delivery, notification preferences,
access-policy review, profile/contact management, and visible success/error UX.
Portal build/lint, identity/API pytest coverage, and authenticated Playwright
journeys pass. Deferred enhancements are passkeys, SMS MFA, permanent trusted
devices, and richer authenticator-device management UX; none blocks the pilot or
the next Placement Management domain.

Placement Management is the current domain after Auth/Account completion. Slice A
is implemented: server-paginated scoped list/detail, placement creation, ward
allocation, mentor assignment, lifecycle commands, and placement audit timeline.
Participant queries are restricted to active assignments. Student confirmation,
orientation handoff, mentor induction, checklist answers/signing, mentor session
entry, and placement history are implemented through dedicated feature and
service boundaries. The portal uses `/placements` with a shared sidebar/header;
management and participant workspaces are role-scoped.

Remaining Placement Management work is completion hardening and offline
reconciliation: richer completion blockers/final-assessment handoff, archive and
withdraw history refinement, offline drafts, retry reconciliation, and visible
Needs attention states. The authoritative records are
`docs/architecture/placement-management-analysis.md`,
`docs/ux/screens/29-placement-management-discovery.md`, and
`docs/ux/screens/30-placement-access-and-setup.md`.

Architecture hardening and full verification now pass. Identity scope validation
uses registered owning-module validators, cross-module reads use public APIs, and
the backend suite passes end to end. Portal lint/build pass, and the expanded
Playwright suite covers signed-out loading, neutral recovery, MFA login,
authenticated `/placements`, placement creation, ward allocation, mentor
assignment, error UX, and sign-out; see
`docs/verification/e2e/placement-and-error-states.md`. Offline Session
Reliability is now in BUILD: the portal has account-scoped IndexedDB session
drafts, a durable idempotent retry queue, command reconciliation, and a visible
Needs attention surface. The full backend suite, portal lint/build, and the
live mentor offline Playwright journey pass; see
`docs/verification/e2e/offline-session-reliability.md`. The run was explicitly
authorised despite the 12% free-space warning. The optional Programme Admin MFA
journey remains credential-gated in this environment.

Role-owned portal workspaces and routing are now implemented. `app/App.tsx`
performs session/bootstrap work only; `app/AuthenticatedRouter.tsx` selects a
role workspace, and Programme Admin, Coordinator, Nurse Manager, Mentor, and
Student each have their own workspace entry point. Shared placement, induction,
mentorship, and participant UI remain shared feature modules. ADR 0015 and
`docs/verification/e2e/role-workspace-routing.md` record the decision and
evidence. Portal build/lint, workspace lint, diff integrity, and four available
browser journeys pass. Programme Admin MFA remains locally credential-gated.

Ward allocation ownership is now resolved and implemented: the Coordinator
creates the placement, the Nurse Manager admits it to a facility ward under a
locked capacity check, and the server derives facility scope from that ward.
Programme Admin remains the controlled fallback. Coordinator allocation is
rejected by the capability boundary. Evidence is recorded in
`docs/verification/evidence/EVIDENCE-006.md`; placement-focused tests and the
full backend suite pass.

The next completion-hardening slice is now integrated: assessments owns an
idempotent student final-assessment command and status API, while placements
exposes a locked public assessment-write authority. The portal participant
workspace renders the close-out form from server status and records endline
confidence plus overall experience as immutable assessment records. Full backend
regression, portal lint/build, and the full five-test browser suite pass; see
`docs/verification/evidence/EVIDENCE-007.md`.

Cross-role dashboard refinement is now implemented on the existing role-owned
portal structure. Programme Admin retains its dedicated administration shell;
Coordinator and Nurse Manager onboarding surfaces have stronger hierarchy and
workspace context; Mentor and Student participant surfaces now use a shared
responsive sidebar/header shell with Lucide navigation, focus treatment, and
reduced-motion support. Portal lint/build and the full five-test browser
regression pass; design decisions are recorded in
`docs/ux/dashboard-design-system.md`.

Lifecycle hardening has progressed with controlled pause/withdrawal reason
validation and an explicit audited Programme Admin archive command for completed
placements. Full backend regression, portal lint, and production build pass;
the remaining Placement Management gate is the dedicated student browser
journey and complete pause/resume-to-completion/archive acceptance flow.

The Scheduled → Awaiting Student handoff is now integrated: Coordinator and
Programme Admin can explicitly release a fully assigned placement, the server
publishes a PlacementInvitationIssued outbox event, and the active Celery
worker/Beat dispatches the student review email through the configured sandbox.
The API contract, full backend suite, portal build/lint, and serial browser
journey pass; see EVIDENCE-009. Next focus is the student confirmation and
orientation journey, followed by induction and mentor-session entry.

Student identity completeness is now strengthened: registration numbers are
required for student invitations, normalized to uppercase, unique within each
institution, and carried through bulk import, invite forms, student lists,
placement payloads, and account data. Phone remains optional contact data and
is not an authentication identifier. Full backend regression, portal
lint/build, and serial browser regression pass. Course/year, emergency contact,
and demographic fields remain deferred until their ownership and privacy use
cases are explicitly approved.

The student-owned profile extension is implemented through a separate
institution StudentProfile record. Students may complete course/programme,
year of study, date of birth, and emergency-contact details after activation;
these fields are excluded from coordinator CSV imports and mentor-facing
placement projections. Demographic fields remain deferred pending a specific
privacy-reviewed requirement. Full backend regression, migration checks,
portal build/lint, and serial browser regression pass; see EVIDENCE-010.

Student confirmation and orientation are now verified through a dedicated live
browser journey. A student sees only the assigned placement, confirms it using
the server-authorized command, and receives the facility/mentor/orientation
handoff. See EVIDENCE-011. Next focus is mentor induction, checklist signing,
and the first mentorship session.

The orientation gate is now implemented and verified: students must
acknowledge placement details, emergency process, and safeguarding expectations
before a mentor can open induction. The dedicated student browser journey and
full backend regression pass; see EVIDENCE-012. Next focus is the mentor-led
induction checklist, comments, sign-off, and activation.

The mentor induction checklist is now implemented and verified. Required item
responses, optional notes, response timestamps, pinned template version, and
mentor signer identity are preserved; electronic sign-off activates the
placement atomically and opens the mentor session workspace. The dedicated
mentor browser journey, admin placement journey, full backend regression,
portal lint/build, and diff checks pass; see EVIDENCE-013. Next focus is the
branded downloadable induction summary/PDF and completion hardening.

The signed induction record now has a branded Print / save PDF handoff sheet.
It presents placement metadata, all checklist responses and notes, template
version, signer, and completion time while keeping the digital checklist as
the authoritative record. Portal lint/build, diff checks, and the mentor
browser journey pass; see EVIDENCE-014. The post-run health check reports 12%
free disk and blocks further heavy verification until authorized remediation;
no cleanup was performed. Next focus is mentorship completion hardening.

Completion hardening now exposes actionable, non-sensitive blocker messages in
the transitions contract. Missing final assessment and open safeguarding
concerns remain enforced synchronously; the latter exposes only count/severity
metadata. Focused completion/session tests, the full backend regression, Ruff,
portal lint, and diff checks pass; see EVIDENCE-015. The environment remains
disk-constrained at approximately 12% free, so the complete role-based
completion acceptance journey waits for authorized remediation.

Placement detail lifecycle history is now more complete: the API exposes
archive timestamps alongside completion and withdrawal metadata, and the
management detail header presents those terminal facts without exposing
restricted notes. Focused completion API coverage, portal/web builds, lint,
and diff checks pass; see EVIDENCE-016. The dedicated terminal-state browser
journey remains pending until disk capacity is restored. After that journey,
the next domain is Reporting and Programme Monitoring.

The mentorship session structure is now aligned with the approved domain model:
sessions remain placement-bound and attributed to the historical mentor
assignment, while the student is resolved through the active student
assignment. The portal now captures optional duration, learning notes, feedback,
and follow-up action, persists them in offline drafts, and reuses one command ID
through retries. The no-patient-identifiers warning is visible at entry; see
EVIDENCE-017 and UX screen 31. Portal lint, TypeScript, and diff checks pass;
backend execution is pending because PostgreSQL on port 5433 is currently down.

The mentorship notes enhancement is now fully verified. Backend session API
coverage, the full backend regression, portal lint/TypeScript checks, and the
offline browser journey pass; the browser journey proves duration, learning
notes, feedback, follow-up, queueing, and reconciliation. PostgreSQL and Redis
were restored through the existing development compose setup; no destructive
cleanup was performed. See EVIDENCE-017. Next focus is the complete terminal
placement acceptance journey, then feedback and safeguarding.

The role-based terminal handoff is now verified at the API boundary: the
student submits the final assessment, the Nurse Manager completes the active
placement, and the Programme Admin archives it. Server-generated completion and
archive timestamps are returned and lifecycle authority remains role-scoped;
see EVIDENCE-018. The dedicated browser journey across those three accounts is
the remaining Placement Management gate. After it passes, move to Feedback and
Safeguarding; broad reporting remains deferred by the approved MVP scope.

Feedback and Safeguarding is now the active domain slice. The backend supports
student confidential or detached anonymous feedback, mentor/student private
concern raising, restricted escalation list/detail reads, audited sensitive
access, reviewer assignment, finding/action/closure commands, external referral
outcomes, idempotency, and identifier-only outbox events. The participant
workspace now exposes branded feedback and safeguarding forms. Full backend
regression, portal lint/build/type-check, and diff integrity pass; see
EVIDENCE-019 and UX screen 32.

The Nurse Manager/Coordinator reviewer queue and detail actions are now
integrated into their dedicated dashboards. The queue is metadata-only and the
detail/action workflow is role- and assignment-scoped. The deterministic
student-to-reviewer browser journey now passes, covering submission, review,
resolution, and closure; see EVIDENCE-019. Broad analytics/reporting remains
deferred until the core workflow has sufficient pilot data. Next action is the
approved Reporting and Programme Monitoring read-side slice, beginning with
role-scoped indicators rather than exports or advanced analytics.

Reporting and Programme Monitoring has now started with a safe read-side slice:
`GET /api/v1/dashboard` returns role-scoped placement lifecycle counts,
safeguarding counts/severity only, mentorship activity, and programme people
totals for Programme Admins. Branded indicator cards are integrated into the
Programme Admin, Coordinator, and Nurse Manager workspaces. The endpoint is
computed on read for now; durable projections, interruption reports, exports,
and minimum-n feedback aggregates remain subsequent work. Backend, frontend
build, dashboard contract, and the authenticated admin browser journey pass.
The complete isolated nine-test browser run now passes after separating the
mentor induction, offline session, safeguarding, and student confirmation
fixtures. Next action is to implement interruption and cohort/facility
projection contracts.

The reporting slice now also exposes `GET /api/v1/dashboard/interruptions`,
reading an analytics-owned, foreign-key-free `analytics_interruption_causes`
materialized view grouped by scoped facility, cohort, and controlled pause
reason. The `refresh_analytics` command provides the rebuild/refresh path, and a
responsive monitoring table is integrated into the three operational
workspaces. Full backend regression, migration, and portal production builds
pass. An hourly Celery refresh task with bounded retries and structured logging
now operationalizes the projection, with explicit forced discovery verified for
both analytics and notification tasks; exports and minimum-n feedback
aggregates remain deferred follow-up work.

Facility and cohort operational indicators are now analytics-owned materialized
views with aggregate placement/session counts and bare scope identifiers only.
Staff dashboard lifecycle/session counts read these projections; operational
views refresh every five minutes and interruption causes hourly through the
explicit Celery beat tasks. Full backend regression, module-boundary checks,
frontend builds, lint, TypeScript, and diff validation pass. Next analytics
slice is the placement summary/progress projection, then minimum-n feedback
suppression and exports.

Minimum-three feedback aggregation is now implemented as the analytics-owned
`analytics_feedback_aggregate` materialized view. SQL suppression prevents any
mentor-visible figure below three responses; the mentor workspace renders only
the resulting score/count summary. A fifteen-minute Celery refresh task and
state-only migration are in place. Full backend regression, migration checks,
frontend builds, lint, TypeScript, and diff validation pass. Next action is the
placement summary/progress read contract, followed by exports.

The placement progress read contract is now implemented as
`GET /api/v1/placements/{placement_id}/progress`. It is computed on read and
scoped through the placement aggregate boundary, composing only safe induction,
mentorship, assessment, and safeguarding milestones; learning is explicitly
reported as unavailable until the Learning domain exists. The participant
workspace renders the branded milestone summary. A fresh-database migration
ordering defect in the operational analytics views was also corrected by
declaring facilities and mentorship dependencies. Focused API tests, a fresh
isolated full backend run (96 passed), Django checks, migration checks, portal
lint, and production build pass. The browser rerun was blocked by the local
runserver process failing to establish its database connection after test
environment churn; the previously passing nine-journey browser suite remains
the last successful full E2E baseline. Next action is exports/observability
hardening, with Learning/content still deferred.

Observability hardening is now implemented with unauthenticated
`GET /health/live` and `GET /health/ready` probes. Readiness checks PostgreSQL
and the configured Redis/cache path without exposing secrets or business data;
dependency failure returns 503 while liveness remains independent. Focused
health API tests, Django checks, migration checks, portal lint/build, and diff
validation pass. Exports remain intentionally gated until a storage and signed
download adapter is selected, because the Stage 6 contract requires
asynchronous jobs, immutable audited export records, and short-lived URLs.
Next action is to make that storage decision and implement the export job
contract, with Learning/content still deferred.

The export job contract is now implemented and verified. Staff can request
placement/cohort CSV exports asynchronously; export records retain server-
derived scope, row counts, status, expiry, audit events, and short-lived signed
downloads. Development/test use a local filesystem adapter; production object
storage remains a release decision. Liveness/readiness probes are also
implemented. The complete nine-test browser lifecycle and final backend,
frontend, Django, migration, and diff gates pass. Current domain status:
identity, placement, induction, mentorship, assessments, safeguarding, and
pilot analytics are integrated; institutions/facilities remain mostly complete;
notifications and feedback reads remain partial. Next implementation focus is
the Learning domain, followed by Content, while preserving aggregate-boundary
and restricted-data rules.

Notifications is now the active domain slice. The backend notification context
has a durable per-recipient inbox record, idempotent event materialisation,
unread/read endpoints, Celery/outbox delivery status, placement assignment
routing, and severity-based safeguarding routing. Event payloads preserve the
identifier-only rule and never carry safeguarding narratives, feedback text, or
session free text. Full backend regression and notification-focused tests pass.
The next Notifications work is the role-aware portal inbox, broader event
coverage (feedback and supervisor follow-up), and provider delivery/bounce
observability before the domain can be marked complete.

The role-aware inbox slice is now integrated across the dedicated portal
workspaces. It loads unread counts and safe notification summaries, supports
loading/empty/error states, and marks notifications read through the protected
API. Portal lint/build pass; the authenticated admin and role-onboarding browser
journeys pass after applying the notifications migration and resetting only the
named E2E fixture. The remaining Notifications work is feedback/session
follow-up routing, provider delivery/bounce observability, and digest scheduling.

Feedback, mentor supervisor-review, and final-assessment notification routing
are now integrated through identifier-only domain events. Anonymous feedback
continues to produce no recipient notification. Full backend regression,
frontend lint/build, Django checks, migration drift, and diff validation pass.
The remaining Notifications work is provider delivery/bounce observability and
digest scheduling.

Notifications pilot implementation is now complete. Signed Mailtrap delivery
and bounce callbacks update safe provider telemetry, and an opt-in weekly
digest task is scheduled through Celery with seven-day throttling and no
restricted content. Full backend regression, focused webhook/digest tests,
frontend lint/build, migration application, Django checks, and diff validation
pass. Remaining release work is provider-specific Gmail/Outlook/mobile visual
QA and production delivery observability; no domain authority is moved into
notifications.

The previously implemented Programme Admin Overview slice remains in BUILD
history, with portal lint/build/diff evidence recorded. The current redesign
slice has returned to UX to settle the workspace skeleton before further UI
implementation. The permission model, seven-page information architecture,
header/sidebar contract, contextual surfaces, responsive rules, and staged
implementation sequence are recorded in
docs/ux/screens/34-programme-admin-workspace-skeleton.md. No server capability
changes are authorised by this UX work. Next action is to review/approve the
skeleton, then move to ARCHITECT only if a new data or route contract is needed;
otherwise proceed to the bounded BUILD slice for the shared admin frame.

The frontend UI stack has now been researched and documented in
docs/architecture/frontend-ui-stack-decision.md. Tailwind remains the sole
styling system; Bootstrap, Tremor, Motion, Recharts, and a table engine are
deferred. Lucide, Radix, TanStack Query, React Hook Form, Zod, Sonner, and the
shared UI package remain the adopted foundations. The shared UI package now has
class-variance-authority, clsx, and tailwind-merge installed for composable
variants. The next action is to implement the shared Programme Admin frame
against the approved skeleton and this package boundary.

The first BUILD slice is implemented: the Programme Admin shell is extracted
into a dedicated frame with the approved sidebar/header vocabulary, responsive
off-canvas navigation, account menu, role label, and a deliberately disabled
Reports destination until its data contract exists. The existing overview
actions and placement entry remain intact. Portal lint, portal production
build, shared UI type-check, and diff validation pass. The required post-build
`sinaps health` check is BLOCKED by 12% free disk, so browser/device visual
verification is pending explicit cleanup or repair authorization. No cleanup
was performed.

The Programme Admin frame now dismisses its account menu on outside pointer
press and Escape, preserving normal menu-item interaction. The Overview remains
the first redesigned page with an attention-led hierarchy, compact programme
signals, and explicit admin boundary guidance rather than a repeated KPI-card
grid. Portal lint, production build, and diff validation pass. The next page
slice is the Overview visual review, followed by the People & access table.

The Overview page slice is now tightened for implementation review: the page
uses a single operational introduction, an “At a glance” signal strip, a
prioritised attention queue, and a restrained role/governance section. Existing
summary data and actions are unchanged. People & access UX is drafted as the
next page: a dense access table with filters, contextual person drawer, and
capability-gated overflow actions. The notification inbox now also dismisses
on outside pointer press and Escape, matching the account menu behavior.
Portal lint, production build, and diff validation pass. Next action is visual
review of Overview, then implement the People & access table against its UX
contract.

People & access is now implemented as the second bounded BUILD slice. The
card-heavy wrapper was replaced with a bordered access register using search,
role/status filters, scope-basis context, compact row actions, pagination, and
a contextual person drawer. Existing API contracts and account lifecycle
permissions remain unchanged. The drawer and status confirmation dialog close
on backdrop click or Escape. Portal lint, production build, and diff
validation pass. Next action is visual review of People & access, then draft
the Programme Setup implementation slice.

People & access has received its responsive and interaction hardening pass.
Desktop retains a comparison table while narrow screens use stacked records
with equivalent role, scope, status, date, and action information. Person
details now provide access-basis context and the permitted account action;
the invitation modal adapts to a bottom sheet on small screens and supports
backdrop/Escape dismissal. Existing API contracts and permissions remain
unchanged. Portal lint, production build, and diff validation pass. Next
action is visual review of this page, then draft Programme Setup.

Programme Setup is now implemented as the third bounded BUILD slice. Identity,
Directory, and Access policy are presented as a responsive setup navigation
rail with calm bordered sections rather than repeated cards. Directory records
use readable list rows, access policies use role sections with capability
labels, and the existing save/create/loading/error behavior is preserved.
Portal lint, production build, and diff validation pass. Next action is visual
review of Programme Setup, then draft the Placements workspace design.

The Programme Setup Directory received a scalability pass. Institution and
facility collections now have independent local search, result counts,
bounded scroll regions for large lists, responsive controls, and distinct
empty versus no-match states with direct add/clear actions. Existing directory
APIs and create flow remain unchanged. Portal lint, production build, and diff
validation pass. Next action is visual review of Programme Setup at desktop
and mobile widths, then draft the Placements workspace design.

The Programme Admin placement route is now separated from role-specific
placement workspaces. The previous shared PortalWorkspaceLayout caused an
admin user to inherit the generic placement sidebar; `/placements` now keeps
the Programme Admin frame, active navigation, notifications, and account
context while coordinator and nurse-manager routes remain role-owned. The
Programme Admin placement list is an operational register with state filter,
responsive desktop/mobile rows, and explicit empty/no-match states. The role
permissions, page structure, and interaction contract are recorded in
docs/ux/screens/36-programme-admin-placements-design.md. Portal lint,
production build, and diff validation pass. Next action is visual review of
admin placements and then refinement of placement detail states.

Placement detail and creation received the next implementation pass. The
blocking “Checking your secure session…” overlay was removed from the initial
loading state and replaced with a quiet inline loading surface; session
validation itself remains active. Admin placement detail now uses a wider,
section-led structure, while creation has clearer foundation guidance and
blocks an end date earlier than the start date. The Programme Admin frame is
preserved across list, create, and detail routes. Portal lint, production
build, and diff validation pass. Next action is visual review of the placement
flows at desktop/mobile widths and refinement of any remaining detail states.

The placement product contract has been reviewed against the problem,
requirements, domain model, state machine, selectors, serializers, and child
workflow boundaries. The canonical Programme Admin listing grain is one row
per placement/student, with cohort as grouping/filter context. Admin read
access is limited to safe placement identity, assignments, dates, lifecycle,
audit, milestone metadata, and safeguarding counts until additive privacy-
reviewed read models exist for sessions, induction, assessments, and concerns.
Controlled fallback actions remain capability/transition-gated. The full
contract and staged UX plan are recorded in
docs/ux/screens/37-programme-admin-placement-product-contract.md. No new
backend authority or sensitive read surface is authorized by this draft.

The next admin placement-detail slice is implemented against the existing safe
contracts. Detail now opens with a lifecycle stepper and a server-driven
decision-point banner, followed by the existing assignment context, audit
history, placement snapshot, and capability-gated actions. Create placement
retains the foundation form and date validation. Restricted mentorship free
text, assessment responses/scores, and safeguarding narratives remain out of
the UI until additive read contracts are approved. Portal lint, production
build, and diff validation pass. Next action is visual review of list/create/
detail flows at desktop and mobile widths, then resolve the additive progress
read-model contract.

The placement lifecycle stepper received a visual correction after browser
review. Numbered nodes now share a single top alignment, connectors run
between the nodes, and state labels sit beneath the numbers; the component
retains a readable minimum width and scrolls horizontally on narrow screens.
Portal lint, production build, and diff validation pass. The broader admin
placement progress/read-model enhancements remain deliberately gated behind
the documented safe contracts.

The lifecycle stepper completion semantics are now explicit: completed stages
render Lucide checkmarks, including the current Completed stage and the full
path when Archived; active/in-progress stages retain their number as the
current point. Portal lint, production build, and diff validation pass.

The next placement enhancement is implemented. Programme Admin placement detail
now includes a safe operational progress-evidence section backed by the existing
composed progress endpoint: induction completion, mentorship session activity,
assessment milestone status, and safeguarding counts. It uses a responsive
bordered list rather than nested cards, preserves the participant presentation,
and keeps detailed responses/free text/narratives outside the admin surface. The
frontend Placement contract now includes the backend-provided student
registration number. Portal lint, production build, and diff validation pass.
Remaining additive contracts are orientation acknowledgement, assignment
interval history, safeguarding severity detail, and richer completion-readiness
links.

The placement detail action area is now hardened for destructive lifecycle work.
Withdraw placement is presented as a red action with a consequence warning,
required reason selection, and explicit confirmation before the existing server
command runs. The pause flow reuses the same focused dialog with its own neutral
copy, and clicking outside the dialog dismisses it. Portal lint, production
build, and diff validation pass.

Placement register hardening is now implemented. The register exposes the
existing server pagination contract, resets to the first page when filters or
search change, and the backend search now covers active student name/email/
registration number and mentor name in addition to cohort and facility. Mentor
changes use the dedicated audited reassignment endpoint when an existing mentor
is replaced and require a reason. The lifecycle stepper now represents paused
and withdrawn states, including withdrawn terminal styling. Portal lint,
production build, and diff validation pass. The focused backend placement tests
were attempted but the local PostgreSQL test connection was unavailable, so
database-backed verification remains pending when the service is running.

The placement register/detail improvements are now integrated. Programme Admin
can filter by cohort, institution, facility, ward, mentor, and lifecycle state;
search covers student and mentor identifiers; desktop rows include the mentor;
and pagination is visible for larger programmes. Loading placeholders and
dismissible command-success notices were added. Detail transition/activity
errors now reach the existing error surface, and complete/archive actions have
explicit confirmation dialogs. Django checks, portal lint, production build,
and diff validation pass. Full placement API tests still require the local
PostgreSQL test service.

The remaining placement hardening is implemented. Detail routes now support
browser refresh/back navigation, register search is debounced, and the register
supports programme-scale filters. Progress evidence now includes the safe
orientation acknowledgement and open safeguarding severity counts. Planned and
effective dates are explicit, and operational history separates assignment
changes from lifecycle activity. The known bundle-size warning remains
non-blocking; database-backed placement tests still require PostgreSQL to be
available.

After visual review, the placement register filter toolbar was refined again.
Search remains the primary visible control; secondary filters are collapsed
behind a responsive Filters control with an active-filter count and compact
Clear action. This reduces vertical competition with the register while
preserving all programme-scale filtering on desktop and mobile. Portal lint,
production build, and diff validation pass.

Export downloads were hardened after live verification exposed a container
storage boundary: Celery generated files in the worker's private /tmp while
the API served from its own /tmp. Development API and worker now share the
export-data volume. Missing files return a clear 410 export-unavailable error,
and the frontend surfaces the server message in the toast. Toasts now have
strong status boundaries and icon panels. Portal lint/build, Compose config,
and diff validation pass.

The Programme Admin Activity page was refined into a quieter audit workspace.
The card wrapper was removed in favor of a bordered timeline, loading remains
content-shaped, API failures have an inline retry path, and pagination exposes
refresh state while preserving safe expandable change metadata. Portal lint,
production build, and diff validation pass.

Programme Setup Access Policy was refined into a calmer read-only policy
register. Scope and MFA remain immediately visible for each role, while granted
capabilities are grouped behind accessible disclosure rows rather than a dense
chip grid. A short server-authority explanation clarifies that the page is a
reference, not an editor. Portal lint, production build, and diff validation
pass.

Programme Setup Directory now presents institution and facility metadata as
secondary scan context (type/level and county) while keeping names primary.
Each list distinguishes loading, empty, no-match, and API-error states with a
section-level retry action. The design remains responsive and keeps creation in
the existing setup dialog. Portal lint, production build, and diff validation
pass.

An additive progress-payload compatibility issue was found during browser
review: older running backend responses may omit the new orientation object.
The admin progress renderer now defaults missing orientation data safely instead
of throwing during render, while displaying the new status when supplied.
Portal lint, production build, and diff validation pass.

The Programme Admin Settings destination was corrected. The shared frame had
wired sidebar Settings to Programme Setup at `/admin/settings`, causing both
destinations to appear identical. Programme Setup remains `/admin/settings`,
while personal account security now has the dedicated `/admin/account` route;
the sidebar Settings action, account menu, and placement workspace all use the
account route. Portal lint, production build, and diff validation pass.

Reports was verified as a frontend placeholder while safe analytics and export
APIs already existed. The first Programme Admin Reports surface is now
implemented using those contracts: operational indicators, interruption
review, asynchronous placement-export request, export status/download queue,
and loading, empty, and retry states. The Reports navigation item is enabled
and remains inside the Programme Admin shell. Portal lint, production build,
and diff validation pass.

Coordinator Overview monitoring hierarchy was refined after live review. The
lower page now has a dedicated “Signals to monitor” section with compact,
border-led interruption and safeguarding panels, while the coordination queue
remains the primary decision surface. Portal lint, production build, and diff
validation pass.

Coordinator placement creation now supports cohort-level bulk setup. The
eligibility endpoint separates selectable students from students already in
an in-progress placement, while the bulk command accepts one date window and
returns created/skipped results. Server-side checks enforce cohort membership,
institution scope, duplicate selection prevention, and safe partial skips;
completed historical placements may be reused. The UI now uses a selectable,
scrollable student list with Select all, excluded-student context, one shared
date range, and a result summary. Placement creation audit entries now carry
program/institution scope, and coordinator Activity is institution-scoped.
Portal lint/build, Django checks, migration checks, diff validation, and live
Docker eligibility checks pass.

The coordinator placement progress 500 was traced to a missing import in
`backend/apps/induction/api.py`: `orientation_acknowledged()` referenced
`OrientationAcknowledgement` without importing it. The model import is now
explicit. Django checks and migration checks pass, the API container was
rebuilt/restarted healthy, and a live database-backed call for the affected
placement returns `False` instead of raising `NameError`. The local focused
pytest run remains blocked by the host runner's inability to connect to the
Docker PostgreSQL service.

Following live review, the coordinator student roster now uses a semantic,
horizontally scrollable table with server-side search and pagination controls.
The cohort area was changed from isolated cards to a compact selectable planning
group register, avoiding the awkward single-card composition while scaling to
larger cohort lists. Legacy student payloads remain safely normalized during
development-server transitions. Portal lint, production build, and diff
validation pass.

The Cohorts & students composition was refined after live visual review. The
student roster is now the primary full-width working surface; enrolment is an
explicit secondary action rather than a permanently competing side panel. This
removes the long empty lane on desktop, strengthens task hierarchy, and keeps
the action form responsive across mobile and desktop. Portal lint, production
build, and diff validation pass.

Programme Setup Directory refinement has started. Institution and facility
lists now distinguish loading, true empty, no-search-match, and API-error
states, with a local retry action for each failed section. The existing bounded
list/search behavior remains responsive for larger directories, and the add
dialog stays inside the setup context. Portal lint, production build, and diff
validation pass.

Account Settings was hardened as the next workspace surface. The account route
now has a responsive page hierarchy with deep-linkable Security, Profile,
Notifications, and MFA recovery tabs. Profile updates propagate to the live
authenticated shell so the programme administrator's name and avatar do not
become stale after saving. Password, session, notification, and recovery flows
retain their existing server contracts and role boundaries. Portal lint,
production build, and diff validation pass.

The Active Sessions action group was refined for clearer hierarchy and smaller
screens. Refresh and Sign out now share a consistent grouped control treatment,
with Sign out clearly marked as a destructive action and both controls wrapping
responsively. Portal lint, production build, and diff validation pass.

Programme readiness and ward management are now implemented as a bounded
vertical slice. The programme summary includes institutions, facilities,
available wards, active coordinator and nurse-manager counts, unassigned
placements, and placements missing setup. Programme Setup Directory now has a
responsive ward register with search, capacity/allocated-slot visibility,
create, edit, and non-destructive availability toggling, backed by scoped,
audited ward APIs. Loading, empty, no-facility, error/retry, and narrow-screen
states are defined. Django checks, migration drift, portal lint, production
build, and diff validation pass. Ward ownership and deeper module/content
management remain separate product slices.

Placement detail presentation was extended against the existing safe read
contract. Completion blockers now identify the responsible next actor, and the
placement snapshot distinguishes the original planned window from an extended
effective end date. Existing orientation acknowledgement, safeguarding
severity, assignment history, and safe progress indicators remain in place.
Portal lint, production build, and diff validation pass.

The Ward directory 404 was traced to a stale/unavailable backend runtime, not
an unregistered source route. The development stack was rebuilt from the
current checkout; API, Celery worker, Celery beat, PostgreSQL, and Redis are
running healthy. Django resolves `/api/v1/wards` and unauthenticated requests
now correctly receive 403, confirming the protected endpoint is live.

The coordinator shell is now a dedicated responsive contract. It owns the
institution workspace rail and header, provides role-specific navigation and
account/notification actions, and keeps placement management in the same role
context. The shell contract is documented in
`docs/ux/screens/38-coordinator-workspace-shell.md`; page-level redesign is
paused at this boundary for review.

The coordinator header is fixed to the viewport on desktop and mobile, with a
17rem desktop rail offset and reserved content space so scrolling pages do not
hide beneath it. Portal lint, production build, and diff validation pass.

Role routing is now being formalized with React Router. The portal has an
explicit BrowserRouter boundary, authenticated role roots (`/admin`,
`/coordinator`, `/facility`, `/mentor`, `/student`), and the coordinator
workspace owns `/coordinator/*`. Coordinator navigation and placement detail
use router navigation rather than root-level history mutations. Public `/`
remains the sign-in/landing entry point.

Coordinator workspace redesign has entered BUILD. The former generic bulk
invitation entry point is now being replaced by an institution-scoped shell
with Overview, Cohorts & students, Placements, Reports, Activity, and Account
& security. The coordinator overview is an institution control room with
student, cohort, placement, interruption, and safeguarding signals. Placement
management uses the same coordinator rail, preserving the existing capability
boundary: coordinators can create/release/monitor and use authorised lifecycle
actions, while ward allocation, mentor assignment, completion, and sensitive
content remain restricted. Portal lint, production build, and diff validation
pass for this slice.

Coordinator authority and page architecture are now documented in
`docs/ux/screens/39-coordinator-product-contract.md`. The confirmed role is
one-institution, university-side coordination: student/cohort preparation,
placement creation/release, institution monitoring, authorised safeguarding
review, approved feedback, reporting, and personal account security. Ward
allocation, mentor assignment, induction, session logging, and completion stay
with the Nurse Manager/Mentor boundaries. The next UX slice is the coordinator
Overview attention and progression model.

Coordinator Overview UX is now implemented from a documented design brief and
the persisted coordinator design system. The page uses a restrained dark
context hero, four institution-specific metric cards, a decision queue, and
lower monitoring sections. Cards are limited to metrics; exceptions use
structured rows. Loading, empty attention, responsive stacking, keyboard focus,
and semantic status treatments are retained. Portal lint, production build,
and diff validation pass.

The coordinator Overview audit fixes are now implemented. Metrics have
independent loading/error/retry states, institution scope is shown in the
control-room context, and a compact responsive placement-flow summary covers
preparation, awaiting student, induction, active, and completed stages from
the current read model. The decision queue includes induction monitoring,
monitoring copy is institution-scoped, and the shell has a skip-to-content
target with improved keyboard focus affordances. Portal lint, production build,
and diff validation pass. Full pipeline fields for paused, blocked, and
missing-setup placements remain a backend read-model follow-up rather than
being inferred in the UI.

The next coordinator page, Cohorts & students, has been restructured against
the Overview design language. It now has a clear institution-register header,
compact summary strip, searchable student roster, explicit empty/error/retry
states, focused cohort setup, and a separate enrolment workflow. Cohort cards
remain useful as planning-group selectors while the roster remains the primary
working surface. The layout collapses cleanly from a two-column desktop view to
a single-column mobile flow. Portal lint, production build, and diff
validation pass.

Bulk placement safety upgrades are now integrated. Eligibility rechecks against
the requested date window, so students with non-overlapping future placements
can be considered while overlapping in-progress placements remain excluded.
The coordinator must review cohort, student count, shared dates, and ownership
boundaries before confirmation. Bulk responses now include a batch identifier;
the UI reports created/skipped counts. Portal lint/build, Django checks,
migration checks, diff validation, API rebuild, and live date-aware eligibility
checks pass.

Coordinator placement screens are synchronized around a continuous create
flow: server-paginated eligibility, search, cross-page manual selection,
whole-cohort selection, review, async processing, polling, and result feedback.
The cross-page selection reset anomaly was fixed so changing pages/search does
not discard prior manual selections. Portal lint/build, Django checks,
migration checks, and diff validation pass.

Large bulk placement creation now has a durable asynchronous lifecycle. Added
`PlacementBatch` persistence, migration, Celery processing, status endpoint,
and coordinator polling for queued/processing/completed/failed states. Bulk
requests using Select all or more than 50 students are queued; smaller batches
remain immediate. Transient worker failures return to queued before retry and
only final exhaustion is marked failed. API and worker containers rebuilt;
migrations, Django checks, portal lint/build, and diff validation pass.

The bulk placement workflow now supports server-side pagination/search and
whole-cohort selection. Idempotent replay reconstructs the full created batch
using the original command payload and command timestamp, rather than
returning only the first placement. Portal lint/build, Django checks,
migration checks, diff validation, and API rebuild pass.

Bulk placement selection now scales beyond one visible page. Eligibility
supports server-side search and pagination, and the coordinator's Select all
mode submits `all_eligible` so it covers the entire cohort while the server
rechecks eligibility at commit time. Date-aware filtering remains active.
Portal lint/build, Django checks, migration checks, diff validation, API
rebuild, and live pagination eligibility checks pass.

Coordinator placement student selection has been redesigned into a focused
scrollable picker modal. The create form now shows only a compact selection
summary; the modal owns search, row selection, select-all/clear-all, server
pagination, keyboard dismissal, and a clear Done action. Selection remains
persistent across pages and the server-side all-eligible mode still covers the
full cohort. Portal lint and production build pass after the redesign.

Coordinator Reports and Activity are now owned by the coordinator feature
instead of reusing Programme Admin screens. Reports uses institution language,
scoped cohort/facility export controls, continuity indicators, export history,
and loading/error/empty states. Activity uses coordinator-relevant action
labels, institution record language, safe expandable metadata, refresh, and
pagination. Portal lint, production build, and diff validation pass.

The Coordinator Reports surface has been redesigned around institution
progress rather than generic reporting. It now leads with the institution
context, placement journey distribution, follow-up signals, and governed export
actions. The hierarchy is intentionally operational: understand progress,
identify continuity risk, then create a scoped snapshot. Loading, empty, error,
retry, permission, and responsive states remain covered. Portal lint, build,
and diff validation pass.

The lower Reports layout was refined after rendered review. Follow-up signals
now use a compact institution status panel when continuity is clear, while
export controls and recent snapshots are paired in a responsive two-column
workflow. This removes excessive empty space and improves the transition from
diagnosis to action. Portal lint, production build, and diff validation pass.

Export downloads now remain on the portal origin and use the authenticated API
client to fetch the signed file before triggering a browser download. This
fixes the development-host mismatch where an absolute 127.0.0.1 API link lost
the portal session cookie and returned DRF 403. Coordinator and Programme
Admin report download actions now share the same authenticated behavior and
show in-progress/error feedback. Portal lint, production build, and diff
validation pass.

The portal now has a shared accessible toast notification layer. Global
frontend action errors are surfaced as dismissible error toasts while existing
inline errors remain available where context is useful. Institution and
Programme Admin report exports now announce request started, request accepted,
download started, download ready, and failure states. Browser download object
URLs are revoked after a short delay for reliable file handoff. Portal lint,
production build, and diff validation pass.

Coordinator student invitations now have a dedicated institution-scoped page.
The Cohorts & students screen links to the workflow without embedding import
controls below the roster. Coordinators can import CSV/Excel files, review
every parsed student in a scrollable modal table, see rejected rows, and send
only after confirmation. Existing bulk invitation APIs and validation rules
are reused, with success/error toasts and a clear return path. Portal lint,
production build, and diff validation pass.

Facility manager workspace work has started. The Nurse Manager home is now a
facility-specific operations dashboard rather than the mentor import screen. It
shows scoped handoff indicators, a pending placement queue, ward capacity,
facility interruption monitoring, safeguarding review, and a working refresh
action. Mentor onboarding has a dedicated `/facility/mentors` route, while
placement operations remain on the existing capability-gated `/placements`
surface. Portal lint, TypeScript validation, and diff validation pass.

Manager sidebar routing is now self-contained: every shared navigation item
resolves to its facility route by default from Overview, Placements, Mentor
onboarding, Account, and future page surfaces. Custom navigation callbacks remain
supported. Portal lint, TypeScript validation, and diff validation pass.

The Nurse Manager overview lower operating surface has been restructured around
the actual facility workflow: individual handoff decision cards, a named
facility-readiness section for ward capacity and mentorship signals, a compact
placement pipeline progression, and concise interruption/safeguarding review
panels. Oversized nested cards and ambiguous section hierarchy were removed while
loading, empty, error, retry, and permission behavior remain intact. Portal
lint, TypeScript validation, production build, and diff validation pass. Live
authenticated browser verification remains pending because Chromium CDP and the
local seeded PostgreSQL service were unavailable in the verification environment.

The overview layout received a spacing refinement after visual review: single
handoff queues no longer reserve an empty second column, readiness panels no
longer stretch to a sibling's height, and the vertical rhythm is tighter across
the page. Portal lint, TypeScript validation, and production build pass.

The handoff queue now scales as a dashboard preview: it shows the first five
decisions and provides a clear route to the full placement register when more
records are available. Ward-capacity failures are centered intentionally within
their panel with a full-width retry action, keeping unavailable data from
appearing as unexplained blank space. Portal lint, TypeScript validation, and
production build pass.

Resolved the Nurse Manager dashboard's facility and ward 403 anomaly. Facility
read services had incorrectly reused the programme-admin-only configuration
guard, so valid facility operators were denied even though their role contract
allows scoped operational reads. Reads now filter by the manager's assigned
facility; ward creation and configuration changes remain programme-admin-only.
Added backend regression coverage for read scope isolation and command denial.
Frontend lint, TypeScript validation, and diff validation pass. Backend compile
passes; pytest could not run because pytest is not installed in the active
environment.

Resolved the ward-authority ambiguity: Nurse Manager authority is operational,
not programme configuration. The Manager can read facility-scoped ward records,
monitor occupancy, and operate placement ward assignments through the placement
workflow; Programme Admin retains ward creation, editing, and archival. The
sidebar now says “Ward operations” and `/facility/wards` is a functional scoped
ward-capacity workspace rather than a placeholder. Portal lint, TypeScript, and
diff validation pass.

Ward operations now deep-link into the placement register with the selected
ward filter, so a Manager can move from capacity context directly into the
students and handoffs requiring action. The placement register initializes its
ward filter from the URL while retaining the existing facility scope and
capability guards. Portal lint, TypeScript validation, and diff validation pass.

Resolved the live 403 after container verification. The development Compose
file copies backend code into the API image and does not bind-mount the source;
restarting containers alone therefore kept the old programme-admin-only
facilities service. Rebuilt `mentormama-api`, verified the seeded active Nurse
Manager has facility scope and that the live service returns the scoped ward.
Future backend dependency or Dockerfile changes require
`docker compose -f docker-compose.dev.yml build api` before restart. Portal
lint, TypeScript validation, and diff validation pass.

The dedicated Ward Operations page has been visually replaced with a facility
readiness layout: summary metrics for wards, open capacity, and allocated
students; full-width ward-on-duty rows; occupancy and placement context; and a
direct ward-filtered placement action. A single ward no longer leaves a blank
half-grid, while multiple wards remain scannable and responsive. Portal lint,
TypeScript validation, production build, and diff validation pass.

Development backend synchronization is now automated through Compose bind
mounts: `./backend` is mounted into API, worker, and beat, and `pnpm dev:stack`
starts the stack without requiring a rebuild for source edits. A rebuild remains
available through `pnpm dev:stack:rebuild` when dependencies or the Dockerfile
change. Compose config validation and a live scoped Manager ward-read check pass;
all five development services are healthy.

Hardened API startup after a transient Compose DNS failure: the API now uses a
development entrypoint that retries database migrations for up to 30 attempts
before starting Django. The broken API network endpoint was force-recreated,
`postgres` DNS resolution was verified, migrations completed, and
`/health/live` returned 200. Compose config and diff validation pass.

Compose startup is now explicitly PostgreSQL-first: PostgreSQL has a startup
grace period and `api`, `worker`, and `beat` are gated on PostgreSQL and Redis
health before creation. The development stack was force-recreated to repair the
network attachment; PostgreSQL and Redis report healthy and the API reports
healthy on `/health/live`.

The Nurse Manager now has a dedicated `/placements` operational workspace,
separate from the programme placement register. It is facility-scoped by the
server, presents summary cards and a handoff queue, supports URL-backed search,
state, ward, and mentor filters, and routes placement details to the existing
capability-gated operational commands. Portal lint, TypeScript validation,
production build, and diff validation pass.

Fixed the student mentorship-session read authorization defect. The sessions
endpoint previously allowed only mentors, causing students' own session-list
requests to return 403. Students can now read sessions attached to placements
where they are assigned, including retained history after an assignment ends;
other students receive no records and non-participant roles remain denied.
Added API regression coverage for self-access and cross-student isolation.
Django checks, Python compilation, portal TypeScript, and diff validation pass;
pytest execution is unavailable because the host and API container do not have
pytest installed.

The student More page now supports choosing among multiple placements before
opening placement feedback or safeguarding, and its `#feedback` links now
activate and scroll to the Support tab on the placement detail page. Existing
profile, security, notification, and recovery routes remain connected. Portal
TypeScript, lint, production build, and diff validation pass.

The student Sessions page now has explicit loading, empty, search-empty, and
request-error states with retry, and session rows open a keyboard-dismissible
detail modal showing the recorded topics, notes, follow-up, placement context,
submission time, and privacy guidance. The modal also links to the placement
record. Portal TypeScript, lint, production build, and diff validation pass.
Live authenticated browser verification remains pending under the existing
environment constraints.

The Programme setup Access policy tab now mirrors the approved two-column
policy design using the live server capability matrix. Role permissions are
grouped into Student, Clinical Mentor, Programme Staff, and Programme Admin;
MFA and capability totals are derived from the API, while unsupported
institutional-email configuration is explicitly shown as unavailable rather
than fabricated. The duplicate setup-progress rail is limited to Identity,
and the setup header callout is contextual for each tab. Portal lint,
TypeScript validation, production build, and diff validation pass.

Programme setup and directory are now rebuilt around the approved reference
composition. Setup persists programme short name, description, academic year,
owner, and mentor-training policy; the directory has real institution, facility,
and ward KPIs, resource tabs, searchable tables, quick actions, responsive help,
and validated create/edit flows. Admin typography and spacing are normalised
through a shared visual contract. Portal lint/type checks, Django checks,
migrations check, Python compilation, and diff validation pass. Live browser
verification remains pending under the existing environment constraints.

Portal route loading and page-shaped skeletons are now implemented. Programme
Admin route changes use React Router location/navigation state; report and
account tabs use URL search params; content and placement destinations load
through route-specific lazy chunks. Activation and facility shortcuts use
router navigation. The workspace Suspense fallback now reflects role and
route, and the shared Skeleton primitive honors reduced-motion preferences.
Research found that no added skeleton package is needed; see
docs/engineering/portal-routing-and-loading-states.md. Portal production build,
portal ESLint, UI package typecheck/lint, Prettier, and diff checks pass. The
Programme Admin workspace chunk fell from 1,034.87 kB (296.59 kB gzip) to
33.40 kB (9.83 kB gzip). Live browser verification is blocked: `sinaps health`
reports 2% free disk and disallows verification pending machine cleanup. Next:
run responsive authenticated navigation/loading-state acceptance when the
verification environment is available.

The consistency pass now covers all five authenticated roles. Coordinator
account-tab selection reads React Router location state; Nurse Manager account
changes update the in-memory user without reloading the portal; and the Student
profile gate uses a profile-shaped skeleton while its profile check runs only
on workspace entry or user change, not on each route transition. Portal
TypeScript validation and targeted ESLint pass. Browser verification and a
production rebuild remain gated by the 2% free disk health result.

Product focus has moved to the Programme Admin first-use journey. The draft
phase-by-phase test plan is in
`docs/ux/screens/45-programme-admin-first-use-live-test.md`. It follows the
approved bootstrap invitation, activation, password, required MFA and recovery
code model, then sequences programme context, directory, scoped staff invites,
learning/content, operational review, reporting, and own-account settings.
Product questions about ward ownership and content readiness are explicitly
kept open for the live phase rather than guessed. Live browser acceptance is
still gated by the recorded 2% free disk health result.

Programme Admin Overview orientation enhancements are now implemented in the
portal source: the `/admin` primary action follows the earliest unmet setup
prerequisite; a checklist reads identity, directory, operational-role counts,
and required mentor-training policy/module state; setup readiness no longer
uses “Programme ready” for the three data-presence checks; draft content uses
review language; setup sections are URL-addressable; and the current programme
name has loading, retry, and missing-name states at mobile and desktop widths.
Portal TypeScript and targeted ESLint pass. Production build and live browser
acceptance remain blocked by the 2% free disk health gate.

Programme setup and directory received a source-backed UX audit proposal at
`docs/ux/screens/46-programme-setup-directory-upgrade-proposal.md`, based on
the user-provided setup and directory screenshots plus portal/API/model/domain
review. It records the current implementation, confirmed field and workflow
gaps, P0/P1/P2 upgrade recommendations, and acceptance criteria. Four product
questions were added to `docs/OPEN-QUESTIONS.md`: ward administration ownership,
training-policy effective scope, the definition of core setup completion, and
capacity reductions below occupancy. This is a draft UX artifact, not approved
implementation scope. Next: product review and decision, then resume Programme
Admin acceptance and implementation when the verification environment passes
the resource-health gate.

The narrow Programme Admin header now keeps its navigation control visible by
reducing mobile horizontal padding and hiding the redundant breadcrumb below
the small breakpoint. The shared notifications panel is viewport-anchored on
small screens so it no longer opens partially off-screen. These changes address
the user-provided mobile screenshots. Live responsive and authenticated
acceptance remains blocked: `sinaps health` reports 2% free disk, 81% RAM use,
and near-full swap, with no local runtime or database service available. Once
the verification environment is repaired, resume Phase 1 acceptance and then
Phase 2 programme identity save/persistence checks from
`docs/ux/screens/45-programme-admin-first-use-live-test.md`.

Institution/facility contact email, phone, and logo support is now present in
source with migrations and ADR-0017. The local migrations have not been applied:
PostgreSQL at localhost:5433 is unreachable, Docker is unavailable, and the
project volume has 2% free space. The source-backed next-feature roadmap is in
`docs/ux/screens/47-programme-setup-next-upgrades.md`; its leading follow-ups are
ward-capacity consistency/safety, Programme owner semantics, pilot coverage
confirmation, and a scope-aware setup-to-invitation handoff. Do not claim setup
is operationally ready based only on directory record counts. Next: recover the
local DB/verification environment, apply and inspect migrations, then decide the
next enhancement slice.

## 2026-10-01 Programme setup governance update

Programme setup governance is resolved in ADR-0018. Programme Admin owns the
shared ward directory; Nurse Managers operate placements within facility
scope. Ward occupancy display and admission use the placement-owned
`OCCUPYING_STATES`, and reductions below current occupancy return a conflict.
Programme owner is required and limited to active Programme Admins in the same
programme. A Programme Admin can record an explicit pilot-coverage attestation;
directory mutations clear it. Setup progress distinguishes record presence from
that attestation. Institution/facility lists have active/archived/all filters,
exact duplicate names produce advisory warnings, and wards have status
filtering. Migration `0013_program_directory_review` is source-only and has not
been applied. No tests, builds, or browser acceptance were run in this slice.
Next: recover DB/verification resources, apply migrations, accept capacity edge
cases and review invalidation, then implement the scope-prefilled Coordinator
and Nurse Manager invitation handoff.

## 2026-10-01 Authenticated Programme Admin Phase 2 acceptance

User authorized bypassing the disk-health gate for local development acceptance
and requested a separate test account. A new local Programme Admin account was
created for the existing E2E programme; the existing shared E2E admin account
was left untouched. Temporary password and TOTP values were stored in a 0600
file and removed after acceptance. With PostgreSQL, Redis, API, and portal
available, all four focused Phase 2 data journeys passed sequentially, and the
narrow-screen/keyboard journey passed separately:
identity save/reload; institution/facility/ward create and detail navigation;
partner contact and logo save/reload/removal; pilot coverage attribution and
directory-change invalidation; current ward occupancy display and capacity
change/restoration; and archive flows. The 375 px UI had no horizontal overflow;
keyboard order, dialog focus containment, Escape close, and focus restoration
passed. A real server rejection for lowering capacity below an occupancy count
greater than one remains unverified because the current fixture has only one
occupying placement. The directory dialogs now share accessible keyboard
behavior via `useAccessibleDialog.ts`. The focused journeys are in
`apps/portal/e2e/phase2-acceptance.spec.ts`,
`directory-create-acceptance.spec.ts`, `directory-write-acceptance.spec.ts`,
`directory-governance-acceptance.spec.ts`, and
`directory-responsive-acceptance.spec.ts`. Portal production build passes.
The broad legacy auth journey still has stale copy and fixture assumptions.
Next workflow phase is scoped Coordinator and Nurse Manager invitations; keep
the below-occupancy API guard acceptance as an open follow-up at that point.

## 2026-10-01 Programme Admin Phase 3 and learning/content continuation

Authenticated local Phase 3 staff-access browser acceptance passed for
Coordinator institution-scoped and Nurse Manager facility-scoped invitations.
Both appeared as Invited with the correct scope; resend queued a fresh
invitation. The local development mail backend is Django console, so email
delivery and recipient activation are not accepted. The Overview directs
operational access review to People & access; the primary invite action
preselects the likely role, while the admin must explicitly choose the scope.

The first read-only learning/content inspection passed in
`apps/portal/e2e/program-admin-content-readiness-acceptance.spec.ts`: mentor
training release policy is visible and persisted across navigation; the
Programme Admin can inspect content types, audiences, statuses, and filter the
learning-module list. No content was changed. The learning/content phase is not
complete: specific draft review, role preview/learner visibility, and a
clearly-marked test draft journey remain. Publication requires a pilot-approved
item and content owner decision. The current verified browser check is
inspection-only; content mutation and publish behavior remain unaccepted.

## 2026-10-01 Phase 3 invitation handoff enhancements

Implemented role-separated invited Coordinator/Nurse Manager counts in the
programme-scoped dashboard summary (one aggregate query, no recipient PII),
clear pending-acceptance language in People & access, role/scope-aware invitation
success copy with a direct review action, and role-specific invitation shortcuts
on the initial Getting started operational-access step. When an operational
role is already pending, the Overview primary action opens People & access for
review instead of blindly issuing another invitation. Invitation dialog now
uses the shared accessible-dialog hook for initial focus, focus containment,
Escape close, and focus restoration. Existing explicit API role/scope checks
remain unchanged; only a sole active scope is preselected, while multiple scopes
remain an explicit Programme Admin choice.

Verification: portal production build and targeted ESLint pass; focused backend
summary test passes and confirms pending role counts do not expose email
addresses; authenticated local Playwright Phase 3 journey passes at 375 px for
Coordinator institution scope, Nurse Manager facility scope, pending status,
resend, contextual queued feedback, role-specific summary counts, no horizontal
page overflow, and dialog keyboard/focus behavior. The rendered Getting started
shortcuts were not exercised because the current E2E programme already has
active operational leads; recipient mail delivery and activation remain
unverified because development uses Django's console email backend. Browser
artifacts and the temporary credential file were removed after verification.

Adversarial solo review (REVIEW-001): no authorization or scope-enforcement
change was introduced; counts remain programme-scoped and contain no recipient
PII; invitation requests continue to use the existing protected API; the UI
distinguishes queueing from acceptance. No schema change or dependency was
introduced; rollback is a source revert. Accepted verification risks are the
unrendered Getting started shortcut state in an incomplete programme and the
unverified local email-delivery/activation path. Do not mark all of Phase 3
accepted until those user-facing boundaries receive evidence.

## 2026-11-08 Authentication experience and authorization hardening

Implemented the authenticator setup and recovery-code UX, plain-language
authentication/recovery copy, clearer session settings, and invitation/account
recovery guidance. Server-side changes rotate sessions after MFA, rate-limit
authentication endpoints, audit MFA failures without codes, revoke sessions
after role/scope changes, recheck export rights at execution, enforce the
documented invitation resend limit, and tighten safeguarding and quiz scope
checks. The source-level API review and remaining risks are recorded in
`docs/engineering/authentication-authorization-review.md`; decisions are in
ADR-0020.

The Sinaps health gate reports critically low disk space and Docker unavailable.
No builds, tests, or live UI acceptance were run; runtime verification remains
pending. This is an implementation pass, not a completed endpoint-by-endpoint
dynamic security audit. Follow up on sensitive account-change step-up, failed
login audit telemetry, setup-session expiry policy, and dynamic cross-scope
authorization checks when verification resources are healthy.

## 2026-11-08 Programme Admin end-to-end review and local environment repair

Source review found that Programme Admin is not fully accepted end to end.
Findings and evidence are recorded in
`docs/engineering/programme-admin-end-to-end-audit.md`. High-priority issues
include an API path that can move an invited account directly to active,
invitation links staying valid after an invited user's role/scope changes, no
complete Programme Admin MFA-recovery/session-revocation workflow, and static
per-person activity/notes tabs. Medium-priority findings include missing
Programme Admin invitation UI, generic audit reasons, unused People selection,
and policy panel copy that implies editable settings.

Recovered about 11 GB by clearing npm package/npx caches and Gradle generated
build/dependency caches. Preserved installed project dependencies, source,
Docker images, containers, and volumes. Repaired Redis's malformed incremental
AOF tail after making a checksum-verified volume backup; Redis, PostgreSQL, and
the API are healthy. The portal is running at localhost:5173 and the API at
localhost:8000 in separate terminals. Both return successful health/page
responses. Sinaps still blocks build and E2E verification at 6% free disk, so
full Programme Admin runtime acceptance remains outstanding.

## 2026-11-08 Programme Admin lifecycle and recovery implementation

Implemented invitation lifecycle safeguards and connected Programme Admin
recovery controls. Pending invitations cannot be activated through the status
API; invitation tokens include account role, scope, and email; pending role or
scope changes require a fresh invitation. Deactivated, unaccepted accounts can
be reissued invitations. Status/access changes require reasons and lock the
target before mutation. Programme Admin now has scoped MFA recovery request
review, target-account session revocation, a Programme Admin invite choice, and
a safe per-person activity timeline. The misleading Notes placeholder and
unused People selection checkboxes were removed. A password-authenticated
session may request authenticator help before MFA completion; access is not
restored until an administrator reviews the request.

Portal TypeScript and focused ESLint, Python compile, Django system checks, and
diff whitespace checks pass. Focused pytest could not run because PostgreSQL is
unreachable from the command environment; Docker commands are denied there.
Live browser acceptance remains pending, so source verification is not claimed
as dynamic security acceptance.

## 2026-11-09 Student fallback, acknowledgement failure, and dependency review

The supplied placement screenshot exposed an undefined `props` reference in
`StudentPlacementDetail`, which crashed the React tree while opening the
acknowledgement view. It now passes the destructured account name. The
acknowledgement read also has an explicit loading/error/retry state, and the
portal root has a React error boundary with a plain-language recovery screen
for unexpected render failures. Library and account-settings styles are now
loaded globally so Student pages do not render as unstyled browser controls.

Dependency review: this portal uses Vite + React/React DOM (lockfile resolves
19.2.7), not Next.js; no `next` or `react-server-dom-*` package appears in the
lockfile. React's Oct 14 2026 critical RSC RCE and high Server Functions DoS
advisories affect the separate `react-server-dom-*` packages, and the upstream
advisory says client-only apps without RSC support are not affected. Recommend
updating React/React DOM to a currently supported patched release in a separate
dependency maintenance change after compatibility checks; do not add an error
boundary package solely for this case because React already supplies the
required boundary primitive and TanStack Query is already installed for
request state.

The screenshot's `/acknowledgement` HTTP 500 cannot be diagnosed from browser
output alone. The new GET reads the new `PlacementAcknowledgement` table, so
the local DB must have migration `0007` applied; if it persists after migration,
inspect the API traceback for the actual exception. Docker/browser verification
remains blocked by the Sinaps low-disk gate (about 7% free) and unavailable
runtime. No migration, build, API request, or UI verification was run in this
pass. See `docs/verification/student-flow-04-placement-signing-and-visual-states.md`.

## Current session update — Email and cohort lifecycle expansion (2026-11-09)

Converted all notification mail construction to plain text and removed HTML alternatives. Security, invitations, verification, password reset, and MFA remain mandatory; optional placement, programme, and account activity notifications now follow email preferences. Added safe lifecycle notifications for placement scheduling, orientation acknowledgement, induction completion, safeguarding report status, and both mentors during reassignment. Session and safeguarding message bodies remain generic and omit restricted narrative.

Implemented the approved cohort improvements: edit with overlap validation, archive while preserving records, bulk enrol preview and overlap counts with commit-time revalidation, cohort placement state counts, and reasoned soft membership removal with an audit record. Added migration `institutions.0004` for removal history and active-only uniqueness. Targeted portal ESLint/TypeScript, Django checks, migration model drift, Python compilation, and `git diff --check` pass. Focused pytest cannot connect to PostgreSQL, so migrations are generated but unapplied and database assertions did not run. Browser acceptance remains blocked by missing browser/device access and resource health; Coordinator remains VERIFY / BLOCKED.

## Current session update — Module MVP readiness audit (2026-11-09)

Audited the backend domains, portal roles, product requirements, recent actor verification records, open questions, and current environment. Added `docs/verification/module-mvp-readiness-2026-11-09.md` with per-module and per-role readiness, source gaps, unverified runtime paths, conditional enhancements, and ranked next actions. Current gate remains VERIFY / MAJOR. `sinaps health` reports disk BLOCKED at 7% free, Docker unavailable, and no listeners; PostgreSQL is unreachable and no browser target is available. This was a source-and-record audit; no module runtime tests were run. The highest-priority product blocker is anonymous feedback privacy; the highest-priority verification blocker is the unavailable database/browser environment.

## Current session update — Anonymous feedback privacy and reporting (2026-11-09)

Implemented the accepted anonymous-feedback flow as a dedicated ratings-only endpoint. Anonymous
feedback stores no placement/student link, comment, or exact timestamp. Replay protection stores
keyed digests and a date without an actor/result reference; per-submission audit/outbox linkage is
omitted and a global daily count is retained. Added migration `assessments.0004` to scrub historical
audit, notification, outbox, idempotency, comment, and timestamp links. Added a minimum-three,
ward-level aggregate projection and Coordinator institution-scoped / Nurse Manager facility-scoped
reporting, plus the Student and staff portal views. Updated ADR 0008 and the verification record.

Django system checks, migration model-drift check, Python compilation, portal TypeScript, scoped
ESLint, and whitespace checks pass. Focused API tests could not initialize because PostgreSQL is
unreachable; migrations were not applied. No browser target is available. Anonymous feedback is
implemented in source but remains VERIFY / BLOCKED pending database migration, tests, and live
browser/API acceptance. See `docs/verification/anonymous-feedback-implementation-2026-11-09.md`.

## Current session update — Initial AI learning integration (2026-11-09)

Product owner authorized a bounded AI integration beginning with an API key and later a self-hosted local LLM. Added ADR 0026 and `docs/architecture/ai-integration-plan.md`. Implemented an OpenAI-compatible Qwen provider boundary and a first learner feature that explains one role/programme-scoped published lesson from its authored content only. It accepts no learner free text, stores no prompt/response, excludes quiz answers and patient/placement/mentorship/safeguarding records, applies per-user throttling, emits content-free provider outcome/latency logs, and has bounded input/output/timeout. AI remains disabled by default. VPS configuration passes the provider key only to the API container; the portal does not receive it. Added user-facing explanation UI, product requirements clarification, and VPS runbook setup/rollback instructions. No provider key was supplied, so no paid external call was made. `git diff --check` and Python compileall pass. Full Compose, backend/database tests, portal lint/build, and staging provider smoke test remain unrun due to Sinaps resource health (disk 7% free, Docker unavailable); the feature needs a staging API-key verification before production activation.

## Session 2026-11-11

- Done: allocation backend + UI (coordinator facility requests, NM incoming/arrange), branded PDF export, ref-counted scroll lock, personal plain-language Activity for all roles, safeguarding summary/take-concern (ADR 0029), NM pages redesigned (placements, placement detail, mentors, mentor detail, wards with NM-managed capacity), ward change command, mentor workload counts open placements only.
- Next (see docs/engineering/placement-allocation-implementation-plan.md): P0-3 shared capacity check + plan hash, P0-4 run record first, P0-5 counts in emails, P0-6/7 notification categories + outbox back-off, P0-8 coordinator override, P0-9 allocation list export; consent mechanism; sidebar audit; remaining restyles (coordinator create/invite/cohorts, mentor and student dashboards).
