# ADR 0010 — Command endpoints for state changes, not a generic PATCH

**Status:** Accepted · **Date:** July 2026 · **Stage:** 6 (§3)

## Context
Stage 3.5 defined a command surface (`AssignMentor`, `CompletePlacement`, `PausePlacement`), each with its
own actor, guard set and transaction boundary. SADD v1.0 §6.3 collapsed several of these into
`POST /api/placements` "create/reassign" — one endpoint, two operations, two guard sets, and no record of
which was intended.

## Decision
Reads are resource-oriented REST. Every state change is an explicit named command endpoint:
`POST /placements/{id}/assign-mentor`. There is no `PATCH` on any aggregate, and no endpoint accepts a
`state` field.

## Consequences
- Authorisation maps one-to-one onto the Stage 3 §9.2 matrix instead of onto field-level PATCH rules.
- The audit trail records intent, not a field diff — which safeguarding review needs.
- The transition table stays server-owned; no endpoint invites the client to set state.
- More endpoints than CRUD would produce. Each is small, individually testable, individually authorised.
- `GET /placements/{id}/transitions` exposes the server's own reading of what is legal now, so clients
  never re-implement the state machine.

## Rejected
**CRUD with PATCH.** A handler that inspects which fields changed is a command router with implicit,
untestable routing.

**GraphQL.** Field-level restrictions (INV-13, POL-016) and aggregate suppression (POL-013a) become
per-resolver guards against arbitrary client-composed queries — every new query shape a new chance to leak.
