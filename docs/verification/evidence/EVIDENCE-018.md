# EVIDENCE-018 — Role-based placement completion and archive handoff

Date: 2026-09-01

## Outcome

The role boundary for placement close-out is verified at the API boundary:

1. The assigned student submits the final assessment.
2. The Nurse Manager completes the active placement.
3. The Programme Admin archives the completed placement.

The completion and archive responses include their server-generated timestamps.
The operation remains idempotent and the existing placement transition table
continues to own the lifecycle.

## Verification

- Role-based completion/archive API acceptance test: passed.
- Full backend regression before this acceptance test: passed 100%.
- Portal lint and TypeScript checks: passed in the current slice. Production
  builds passed immediately before the current session-form field update.
- Ruff: passed.
- `git diff --check`: passed.

## Remaining gate

The equivalent browser journey across student, Nurse Manager, and Programme
Admin accounts remains to be run as a dedicated acceptance flow. It requires
the local seeded accounts and enough disk capacity for browser artifacts.

## Next focus

Run the terminal-state browser journey, then move to the approved Feedback and
Safeguarding domain. Broad reporting remains deferred until the pilot workflow
and safety gates are complete.
