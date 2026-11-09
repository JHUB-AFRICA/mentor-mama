# ADR 0023 — Batch one mentor session across attending students

**Status:** Accepted for implementation · **Date:** 9 November 2026

## Context

The mentor currently enters shared session details once per placement. This
duplicates work when a mentor teaches or debriefs several assigned students
together. Session history, authorization, and reporting are placement-scoped,
so replacing those records with one unscoped session would lose accountability.

## Decision

- The mentor selects all eligible students or an explicit subset who attended.
- One idempotent batch command creates a batch record and one ordinary,
  placement-scoped `Session` per selected student, atomically.
- A batch result links each selected placement to its created session or to an
  already-logged session satisfied by the existing five-minute duplicate rule.
- Server-side checks independently verify current mentor assignment, active
  placement state, placement date window, and pause interval for every student.
  Any invalid placement rejects the whole new batch; the client must not silently
  drop selected students.
- Session notes are copied to each selected student's record, since the existing
  access model is placement-scoped. The form warns that notes are shared across
  the selected students and must not include patient identifiers or an
  individual's private information.
- A selected subset is preserved for offline retry and the whole command uses a
  single idempotency key. Partial writes are not allowed.
- One batch can include up to 100 assigned placements. The mentor roster must
  paginate through the entire server-scoped result before offering Select all.
- Students in Orientation or Induction are not eligible for session logging.
  After the student acknowledges orientation, the currently assigned Mentor
  opens and signs the induction checklist; this activates the placement.

## Consequences

- Student and reviewer history continues to use the existing session contract.
- Grouping is explicit and auditable without introducing a new session schema
  for clients that read per-placement records.
- Batch membership, duplicate outcomes, and idempotent replay need a migration.
- The browser's offline queue must preserve the complete selected set and must
  never turn an all-or-nothing batch into several independent writes.
- A session batch is available for a single selected student too, so response,
  duplicate, and retry handling follows one consistent command contract.

## Rollback

Disable the batch endpoint and hide the batch selector; retain already-created
per-placement session records and batch metadata. The schema migration is
additive and can remain in place during rollback.
