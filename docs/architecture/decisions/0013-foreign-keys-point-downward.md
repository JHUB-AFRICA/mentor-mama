# ADR 0013 — Cross-module foreign keys point downward; upward relations are bare identifiers

**Status:** Accepted · **Date:** July 2026 · **Stage:** 5 / walking skeleton
**Supersedes:** the MA-12 formulation in Stage 4 §7.5 ("only `identity.User` and `placements.Placement`")

## Context

Stage 4 permitted cross-module foreign keys only to `identity.User` and `placements.Placement`. Building the
walking skeleton produced 22 cross-module foreign keys, and the boundary contract test showed that:

1. Most of them are legitimate and **point downward** — `placements.Placement -> institutions.Cohort`,
   `safeguarding.Escalation -> facilities.Facility`. The original rule would have banned all of them for no
   benefit.
2. Two of them pointed **upward** and were a genuine defect: `identity.User -> institutions.Institution` and
   `-> facilities.Facility`, i.e. layer 0 depending on layer 1. `import-linter` could not see them, because a
   model relation is declared as a string.

A separate question was raised: why use foreign keys at all, rather than bare UUID columns resolved through
each module's `api.py`? Bare identifiers would decouple the modules completely.

## Decision

- A cross-module FK is permitted **only when the target sits in a lower layer** (or the same module), declared
  by string reference, always `on_delete=PROTECT`.
- **Upward or sideways relations use a bare `UUIDField`**, validated on write via the owning module's `api.py`.
- **Leaf modules (`analytics`, `notifications`) hold bare identifiers only**, so projections stay truncatable
  and rebuildable (MA-06).
- Enforced by `tests/test_module_boundaries.py`, which also prints the full FK inventory.

## Why not bare identifiers everywhere

Stress-tested in `tests/test_fk_stress.py` rather than argued.

The `mentorship_session_window` trigger enforces INV-04 and INV-05 by reading the parent placement. When no
parent row matches, `p.state` is NULL and `NULL <> 'active'` evaluates to NULL — not true — so **every guard in
the trigger silently passes**. Django declares FKs `DEFERRABLE INITIALLY DEFERRED`, which let the test observe
this directly: the insert succeeds, the trigger stays silent, and only the deferred FK rejects it at commit.

Without the FK, a session with a bogus `placement_id` would be stored with the active-placement and date-window
invariants unenforced — in a system whose audit trail may be evidence in a research evaluation.

The resulting principle:

> Use a foreign key wherever its absence fails **open**. A bare identifier is acceptable where its absence
> fails **closed**.

`identity.User.institution_id` / `facility_id` are bare UUIDs under that test: an FK would point upward, and a
dangling scope id fails closed — `selectors.in_scope` filters on it, so a bad value returns no rows rather than
another tenant's.

## Consequences

- The relational graph now matches the import graph: both point downward only.
- 22 cross-module FKs are documented as the coupling extraction would have to pay for (Stage 4 §7.5).
- `identity` depends on no domain module, as layer 0 requires.
- Two columns lose database-level referential integrity, accepted because they fail closed.
- `PROTECT` everywhere reinforces INV-10: a delete that would orphan operational data is refused.

## Rejected

**Bare identifiers everywhere.** Decouples the modules and disables the trigger-enforced invariants, as the
stress test demonstrates. It trades an enforced rule for a stylistic preference.

**Keeping the "two permitted targets" rule.** It banned 20 legitimate downward relations while failing to catch
the two upward ones that actually mattered.
