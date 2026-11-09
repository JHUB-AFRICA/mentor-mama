# EVIDENCE-008 — Placement lifecycle hardening

Requirement(s): POL-021, WFR-004, WFR-017, WFR-020, T-17, INV-09
Platform/device/browser: Local PostgreSQL/Redis and portal TypeScript build

Implemented:

- Pause and withdrawal commands now accept only their approved controlled
  vocabularies at the transport and service boundaries.
- Programme Admin receives the dedicated `archive_placement` capability.
- `Completed → Archived` uses the existing server transition table and an
  explicit audited assertion; no generic state mutation was introduced.
- The placement UI exposes Archive only when the server-provided transition and
  capability make it available.

Verification:

- Focused pause/withdrawal invariant tests passed.
- Focused completion/archive tests passed.
- Full backend regression passed at 100%.
- Portal lint and production build passed.

Result: PASS for this implementation slice. The full student browser journey
and combined lifecycle acceptance flow remain the next verification gate.
