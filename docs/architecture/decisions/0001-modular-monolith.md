# ADR 0001 — Modular monolith over microservices

**Status:** Accepted · **Date:** July 2026 · **Stage:** 4 (§2)

## Context
Eleven bounded contexts were identified in Stage 2. The team is 3–6 developers. Pilot scale is
30–80 students and 10–25 mentors across one or two maternity units. Two operations in the Stage 3
transaction inventory require atomic guards that span contexts (TX-03, TX-08), and both guards are
safeguarding-critical: no unoriented student practises on a labour ward (INV-02), and no placement is
signed off with an open safeguarding concern (INV-07).

## Decision
One deployable application, internally partitioned into modules with boundaries enforced in CI.

## Consequences
- Atomic cross-context guards remain a single database transaction. No sagas, no compensating actions.
- One deploy, one database, one log stream — matched to a team with no dedicated ops capacity.
- Process isolation does not enforce our boundaries, so tooling must: see ADR 0002.
- Extraction remains possible. The couplings that would have to be paid for are recorded in Stage 4 §7.5
  rather than discovered at extraction time.

## Rejected
**Microservices.** Would require distributed transactions or eventual consistency on INV-02 and INV-07.
Eventual consistency on those two is not a performance trade-off; it is the product failing at its purpose.
Also requires an owner per service, which a team of this size does not have.
