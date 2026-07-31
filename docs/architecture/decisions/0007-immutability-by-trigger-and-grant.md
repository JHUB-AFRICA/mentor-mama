# ADR 0007 — Immutability enforced by triggers and revoked grants

**Status:** Accepted · **Date:** July 2026 · **Stage:** 5 (§3.1, §6.2, §7.4)

## Context
Stage 3 requires that submitted feedback and assessments are append-only (INV-14), that terminal
placements are immutable (INV-09), that audit entries are never altered or deleted (WFR-031), and that
no operational record is ever hard-deleted (INV-10). Every one of those was stated as a rule the
application must respect.

## Decision
Enforce them in the database: `BEFORE UPDATE OR DELETE` triggers that raise the corresponding domain
error, and `REVOKE UPDATE, DELETE` on append-only tables from the application role.

## Consequences
- The guarantees hold for every write path — ORM, management command, admin, a psql session, a future
  second service — not only the ones that remembered.
- Corrections must go through revision rows, which is what the audit trail wanted anyway.
- A legitimate data fix requires a deliberate, privileged, logged action. That is the intent.
- Triggers must raise the exact error codes from Stage 3 §12 so the API layer can translate them.

## Rejected
**Application-layer checks only.** They are one forgotten code path away from a mutated safeguarding
record, and this data may be evidence in a research evaluation.
