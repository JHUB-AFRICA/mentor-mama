# ADR 0009 — PostgreSQL in every environment, including local development

**Status:** Accepted · **Date:** July 2026 · **Stage:** 5 (§10)

## Context
The backend scaffold defaults to SQLite locally and Postgres in production. Stage 5 pushes 12 of 18
invariants into the database using partial unique indexes with predicates, `EXCLUDE USING gist`,
`citext`, `daterange`, and PL/pgSQL triggers.

## Decision
PostgreSQL 16 everywhere, including local development and CI. Provisioned by the existing Docker Compose.

## Consequences
- The rules a developer runs against locally are the rules production enforces.
- The constraint test suite (§10) is meaningful, because it runs on the real engine.
- `btree_gist` must be enabled in every environment.
- Contributors need Docker running. Acceptable; the compose file already exists.

## Rejected
**SQLite for local development.** It cannot express most of Stage 5, so local runs would silently not
enforce the invariants — the worst possible outcome: green locally, and a rule that does not exist.
