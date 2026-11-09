# ADR 0022 — Student placement acknowledgement is a signed, immutable record

**Status:** Accepted · **Date:** 9 November 2026 · **Stage:** VERIFY

## Context

The Student placement assignment previously advanced from `awaiting_student` to
`orientation` after a checkbox alone. The assignment document showed blank
student and date lines, and there was no record to view after confirmation.
Separately, final-assessment availability used only the placement end date, so
an old placement still in Orientation could be offered close-out.

## Decision

- A Student reviews the assignment and types the account name to acknowledge
  it. The service normalizes whitespace and checks the name against the signed-in
  account before accepting the command.
- In the same database transaction as the placement transition, the server
  creates one `PlacementAcknowledgement` per placement with the signed name,
  student, and server-generated `signed_at` timestamp.
- For legacy placements already in Orientation without a record, the Student
  may sign now. The saved timestamp reflects the current signing time; it is
  never backdated and does not change the placement stage.
- A database trigger prevents updates and deletes. The Student and in-scope
  programme staff can read the record; the Student UI presents a completed
  acknowledgement as view-only. Existing progressed placements without a signed
  record are not backfilled with invented names or dates.
- Final assessment is available only for Active or Paused placements after the
  effective end date. Both the status response and submission command enforce
  this lifecycle rule.
- Shared Content Library and Account Settings styles load for every workspace,
  because those components are shared outside Programme Admin.

## Consequences and rollback

Migration `placements.0007` adds the immutable acknowledgement table. App
rollback may restore the prior application while leaving this additive table
and trigger in place. Do not reverse the migration after signed records exist;
that would delete acknowledgement history. The old application does not need
the new table to run.
