# EVIDENCE-009 — Scheduled placement release and invitation dispatch

Requirement(s): T-03, POL-009, WFR-001, WFR-002
Platform/device/browser: Chromium via Playwright, local Django, PostgreSQL,
Redis, Celery worker/Beat, and Mailtrap sandbox delivery.

Implemented:

- Coordinator and Programme Admin now use the explicit `release_placement`
  capability for the `Scheduled → Awaiting Student` handoff.
- The placement detail view exposes “Send placement invitation” only when the
  server-provided transition and capability allow it.
- `POST /api/v1/placements/{placement_id}/invite` performs the guarded
  transition and publishes `PlacementInvitationIssued` through the outbox.
- The notification adapter renders the student placement-review email.

Verification:

- Focused release API contract passed, including state transition and outbox
  assertion.
- Full backend regression passed at 100%.
- Portal lint, production build, and `git diff --check` passed.
- Serial Playwright suite passed 5 tests; the optional offline-session test was
  skipped because its opt-in flag is disabled.
- The browser flow covered placement creation, ward allocation, mentor
  assignment, invitation release, history refresh, and sign-out.
- The live Celery worker connected to Redis and Celery Beat scheduled the
  dispatcher. The placement invitation outbox event was dispatched on attempt
  one, and no outbox events remained pending after the run.

Result: PASS for the scheduled-placement release gate. Student confirmation,
orientation, induction, and mentor-session browser journeys remain the next
workflow gate.
