# ADR 0004 — Transactional outbox with post-commit dispatch

**Status:** Accepted · **Date:** July 2026 · **Stage:** 4 (§7.3), Stage 3 (WFR-026, WFR-027)

## Context
SADD v1.0 described notification dispatch and dashboard updates as part of the atomic unit for operations
like mentor assignment. That is not implementable: an email provider timeout would roll back a legitimate
assignment, and a sent email cannot be un-sent by a rollback.

## Decision
Domain events are written to an outbox table inside the same transaction as the domain rows. A worker
dispatches them after commit, with retry. No external I/O — email, SMS, file generation, third-party API —
occurs inside a business transaction.

## Consequences
- The *decision* is atomic; the *side effects* are eventually consistent and retryable.
- Notification and analytics failures never fail a business operation.
- Events are the only mechanism for cross-module side effects (Stage 4 §7.3); synchronous reads remain
  available for guards that must be exact (§7.1).
- Requires a worker process and at-least-once delivery, so event handlers must be idempotent.
- Enforced by a test fixture that fails any test performing I/O inside a transaction block (MA-13).

## Rejected
**Direct calls to the notification module from the write path.** Couples delivery to correctness and
reintroduces the rollback problem.

**A message broker beyond Redis.** Unnecessary at pilot scale; the database is already the transaction
boundary we need.
