# EVIDENCE-019 — Feedback and safeguarding API boundary

## Scope

Student feedback routing and the safeguarding concern lifecycle were integrated
with the existing placement, identity, audit, idempotency, and outbox modules.

## Verified

- Confidential feedback is placement-linked and returns a submission handle.
- Anonymous feedback is stored in the detached cohort/facility/ward table and
  returns no identifier.
- Concern list responses omit `description`, `finding`, `action_taken`, and
  `referral_note`.
- Concern detail is denied to an unassigned coordinator and released to the
  assigned reviewer; the sensitive read is audited.
- Reviewer transitions enforce assignment, conflict-of-interest, documented
  action, and closure date requirements.
- Outbox events contain identifiers/status only.
- Nurse Manager and Coordinator dashboards render a metadata-only review queue
  and the protected detail/action workflow.

## Commands

- `.venv/bin/pytest -q backend/tests` — passed.
- `npm run lint` — passed.
- `npm run build` — passed.
- `pnpm --filter @mentormama/portal exec tsc --noEmit` — passed.
- `git diff --check` — passed.

The dedicated browser journey passed:

- `npx playwright test e2e/safeguarding-review.spec.ts` — 1 passed.

It proves student confirmation/orientation, concern submission, reviewer MFA,
metadata-only queue, assignment, protected detail, finding, resolution, and
closure. The fixture is DEBUG-only and resettable.
