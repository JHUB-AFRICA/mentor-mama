# ADR 0003 — Cross-layer guards use dependency-inverted ports, not event-maintained counters

**Status:** Accepted · **Date:** July 2026 · **Stage:** 4 (§8.2)

## Context
Completing a placement requires two facts owned by higher layers: no escalation is open
(INV-07, owned by `safeguarding`) and a final assessment exists (INV-08, owned by `assessments`).
`placements` sits below both. An upward import would create a dependency cycle in which the core domain
depends on its own children.

## Decision
`placements` defines a `CompletionBlocker` port it owns. `safeguarding` and `assessments` implement and
register it at start-up. The completion transition consults all registered blockers synchronously, inside
the transaction holding the placement row lock.

## Consequences
- Dependencies point downward: children depend on `placements`, which depends only on its own interface.
- The guard is exact at the moment of commit, not eventually consistent.
- New blockers cost nothing in `placements` — a Phase 2 CPD rule registers one from `learning`.
- The blocker set is assembled at start-up, so a module failing to register is a silently missing guard.
  Mitigated by a start-up assertion on expected blocker names and a test per blocker (MA-16).

## Rejected
**Event-maintained counters** (`open_escalation_count` on the placement). A dispatch lag of one second
allows a placement to be signed off with an open safeguarding concern. Rejected on correctness.

**Upward imports.** Creates a cycle, and every future child of the aggregate adds another edge.
