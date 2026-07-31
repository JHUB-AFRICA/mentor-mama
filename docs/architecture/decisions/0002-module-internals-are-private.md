# ADR 0002 — Module internals are private; `api.py` is the only cross-module surface

**Status:** Accepted · **Date:** July 2026 · **Stage:** 4 (§6, §10)

## Context
ADR 0001 accepted a modular monolith, which means nothing physically prevents one module from importing
another's models and writing to tables it does not own. A boundary described only in a document is a
suggestion; the first deadline turns it into a shortcut.

## Decision
Each module exposes exactly three public files: `api.py` (functions returning value objects),
`events.py` (event definitions), and `ports.py` where the module defines a Protocol for a **higher** layer
to implement (ADR 0003). `models.py`, `services.py`, `state_machine.py`, `selectors.py`, `views.py` and
`blockers.py` are private.

`ports.py` is public because a port exists to be implemented elsewhere: hiding it would make dependency
inversion impossible. This was found by the boundary contracts failing on
`safeguarding.blockers -> placements.ports` during the walking skeleton, not by review.
Enforced by `import-linter` contracts in CI: a layered contract for dependency direction (MA-01…MA-04)
and a forbidden-module contract for internals (MA-11).

## Consequences
- Cross-module access is explicit, reviewable, and countable.
- `api.py` returns value objects rather than ORM instances, so a caller cannot save what it does not own.
- Adding a cross-module dependency requires editing a public surface — visible in review.
- Cross-module foreign keys must point **downward** (MA-12); upward or sideways relations are bare
  identifiers, and leaf modules hold no domain FKs at all. See ADR 0013.

## Rejected
**Convention plus code review.** Every team believes it will hold this line. The failure is not
malice; it is a Friday afternoon and a working import.
