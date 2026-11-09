# ADR 0024 — Batch mentor induction for students attending together

**Status:** Accepted for implementation · **Date:** 9 November 2026

## Context

The mentor currently opens and completes an induction checklist separately for
each student. That repeats the same ward handoff when students attend together.
Induction is nevertheless a safety and accountability record that belongs to
one placement and must identify the mentor who completed it.

## Decision

- A mentor may select up to 100 assigned students who are ready for induction
  and share the same published checklist version.
- Students must personally acknowledge their orientation first. A separate
  idempotent batch reminder can ask pending students to complete that step; it
  never creates or implies an acknowledgement.
- Opening a group creates or joins one ordinary checklist for each placement.
  Each answer is copied into every selected checklist in one transaction.
- The mentor confirms the answer applies to all attendees. Individual
  differences are handled through the existing per-student checklist flow.
- Signing is all-or-nothing. Every required item must be answered for every
  selected student. The existing lifecycle transition activates each placement
  in the same transaction as its own signed checklist.
- All operations enforce current mentor access and program scope on the server,
  record audit/outbox activity, and use idempotency keys.

## Consequences

- Existing Student and reviewer checklist reads continue to return one record
  per placement.
- A group with different checklist versions must be split. The batch endpoint
  rejects incompatible or unauthorized selections without partial writes.
- The mentor remains responsible for the induction; students retain ownership
  of their orientation acknowledgement.
- The additive batch metadata requires the induction migration and database
  verification before live use.

## Rollback

Hide the group induction and reminder actions and retain the existing individual
checklist flow. Already-created per-placement checklists remain valid; batch
metadata can remain in the database.
