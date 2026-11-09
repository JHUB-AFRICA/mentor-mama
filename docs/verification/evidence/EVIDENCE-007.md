# EVIDENCE-007 — Final assessment and close-out integration

Requirement(s): INV-08, WFR-016, WFR-017, WFR-019, REQ placement lifecycle
Platform/device/browser: Local PostgreSQL/Redis, Chromium via Playwright, portal
Starting state and test data: Synthetic active placement, assigned synthetic
student, local deterministic test fixtures; effective end date moved only inside
tests for the permitted-window assertion.

Journey and API verification:

- Focused backend tests passed for before-window rejection, student-only locked
  write authority, immutable exit/endline record creation, score boundaries,
  idempotency requirement, audit, and outbox publication.
- Full backend regression passed at 100%.
- Portal lint and production build passed.
- Full portal browser regression passed: 5 tests passed, including Programme
  Admin placement creation/ward allocation/mentor assignment and mentor offline
  reconciliation. Existing authenticated flows remained green after adding the
  student assessment status request.

Expected result: final assessment is a real user-facing path to satisfy the
completion blocker, while placement state remains owned by the placement service.

Observed result: PASS. No unauthorised assessment path, contract mismatch, or
authenticated browser regression remained.
