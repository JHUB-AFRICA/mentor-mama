# EVIDENCE-017 — Mentorship session structure and notes

Date: 2026-09-01

## Outcome

The mentor session form now exposes the optional session fields already defined
by the domain model and API: duration, what was covered, feedback given, and
follow-up action. These fields are persisted in the account-scoped offline
draft and sent through the existing idempotent session command. The form also
shows the no-patient-identifiers warning at the point of entry.

The session remains linked to a placement and historical mentor assignment;
student identity is resolved from the placement’s active student assignment.

## Verification

- Portal lint: passed.
- Portal TypeScript check: passed.
- `git diff --check`: passed.
- Backend API session regression: passed, including notes and follow-up
  persistence.
- Offline browser journey: passed, including duration, notes, feedback,
  follow-up, queueing, and reconciliation.

## Resource note

The local environment previously reported approximately 12% free disk. The
development PostgreSQL and Redis services were started through the existing
compose configuration for this authorized verification run; no data cleanup,
process termination, or destructive action was taken.

## Next focus

Complete the role-based terminal placement journey, then begin the deferred
feedback and safeguarding slice.
