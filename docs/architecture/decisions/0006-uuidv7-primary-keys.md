# ADR 0006 — UUIDv7 primary keys

**Status:** Accepted · **Date:** July 2026 · **Stage:** 5 (§2)

## Context
The offline-first design (Stage 3.5 §2.4) needs identifiers generated on the client, before the row
reaches the server. Sequential integers cannot do that. UUIDv4 can, but its random prefix scatters
B-tree inserts and inflates index churn.

## Decision
UUID primary keys, using UUIDv7 (time-ordered prefix) wherever the application generates them.

## Consequences
- Offline records carry their final identity from creation; no post-sync ID rewriting.
- Index locality close to sequential, without exposing row counts in URLs.
- `command_id` (idempotency) is the same shape as any other key.
- 16 bytes per key rather than 4–8. Irrelevant at pilot scale.

## Rejected
**Auto-increment integers.** Cannot be generated offline, and leak volume through URLs.
**UUIDv4.** Same size, worse index behaviour, no benefit here.
