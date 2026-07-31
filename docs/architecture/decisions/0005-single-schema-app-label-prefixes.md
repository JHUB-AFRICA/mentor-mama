# ADR 0005 — Single Postgres schema with Django app_label table prefixes

**Status:** Accepted · **Date:** July 2026 · **Stage:** 5 (§2)

## Context
ADR 0002 makes module internals private and enforces boundaries in CI. The database could reinforce
that with a Postgres schema per module and per-schema grants.

## Decision
One schema (`public`), with tables named `<module>_<entity>` — which is Django's default `app_label`
prefix, so module ownership is legible for free in every query, EXPLAIN plan, and slow-query log.

## Consequences
- Cross-module foreign keys (limited to `identity_user` and `placements_placement` per MA-12) stay
  trivial; cross-schema FKs are legal but awkward in Django.
- Ownership is a naming convention at the database level, enforced by the CI import contracts above it.
- Moving to schema-per-module later is a rename plus `search_path` work — possible, not free.

## Rejected
**Schema per module.** Real isolation, but Django support requires manual `db_table` qualification on
every model, breaks `dumpdata`/`loaddata` ergonomics, and buys isolation we already get from ADR 0002 at
a stage where no module is a candidate for extraction.
