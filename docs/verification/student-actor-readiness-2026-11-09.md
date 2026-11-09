# Student actor readiness review — 9 November 2026

## Scope reviewed

Source-level trace of invitation activation/profile gate, Student placement
list and detail, placement acknowledgement, orientation, induction hand-off,
sessions received, programme library, feedback/safeguarding, endline assessment,
notifications, and account/security settings. Checked the corresponding portal
routes, API clients, Django routes/views/services, role capabilities, data
models, and the existing Student verification notes.

## Readiness by journey

| Journey | Source status | Evidence / remaining check |
|---|---|---|
| Invitation, sign-in, and profile completion | Implemented | Profile reads distinguish incomplete data from API failure; required fields match the server profile model. Live invitation email and activation are unverified. |
| Placement list, review, and acknowledgement | Implemented in source | Student scope and transition rules are server-owned. Typed account-name acknowledgement is timestamped by the server and immutable. Migration `placements.0007_placementacknowledgement` must be applied; desktop/mobile live flow is unverified. |
| Orientation and induction hand-off | Implemented in source | Orientation acknowledgement is readable/idempotent; induction is performed by the Mentor. Live API persistence and role boundaries are unverified. |
| Session history | Implemented in source | Own-placement session reads preserve available results and expose partial-load/retry state. Live privacy/scope check is unverified. |
| Library | Implemented for read/return | Student sees role-visible published content; module quiz completion is not a Student workflow in the current domain service (mentor-only), so Student-facing quizzes must not be treated as a promised capability without a product decision. Live audience isolation is unverified. |
| Confidential feedback | Implemented in source | Placement-scoped command and restricted reviewer permissions exist; submission, notification, and failure retry need live acceptance. |
| Anonymous feedback | Implemented in source; acceptance pending | Dedicated ratings-only command stores cohort/facility/ward/date and response scores without comments, actor, placement ID, or exact timestamps. Digest-only replay protection avoids an actor/result mapping. Reporting is limited to Coordinator institution scope and Nurse Manager facility scope, with a minimum of three submissions per ward/question. Migration `assessments.0004` scrubs legacy audit, outbox, notification, idempotency, comment, and exact-time links. Database migration and API/browser acceptance could not run because PostgreSQL and a browser target are unavailable. See ADR 0008. |
| Safeguarding | Implemented in source | Student submissions use role/scope/domain checks and preserve draft/idempotency state on failure. Live submission and reviewer notification remain unverified. |
| Final assessment and close-out | Implemented in source | Active/Paused lifecycle and effective end date are enforced in both UI and API; completion is server-guarded. Live due/not-due, duplicate, and notification cases are unverified. |
| Account/security/settings | Implemented in source | Profile, notification preferences, authenticator recovery request, devices, and support routes have explicit loading/error states. Live security and account status cases are unverified. |

## Decision

Student is **not ready to mark complete** yet. Anonymous feedback is now
implemented in source under the accepted POL-014/POL-014a privacy contract, but
its migration and live acceptance remain unverified. The live acceptance journeys in
`student-flow-01` through `student-flow-04` also remain unrun because the local
verification environment is unavailable under the Sinaps resource gate.

No claim of complete end-to-end acceptance is made from this source review.
