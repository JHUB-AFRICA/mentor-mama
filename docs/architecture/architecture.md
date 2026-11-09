# MentorMAMA — Canonical MVP Architecture

## System shape

MentorMAMA is a Django 5 modular monolith with Django REST Framework, PostgreSQL,
and React/TypeScript/Vite web applications in a pnpm workspace.

```text
apps/portal (PWA) ── session HTTP API ── backend/config
                                           ├─ identity
                                           ├─ institutions / facilities
                                           ├─ placements (aggregate owner)
                                           ├─ induction / mentorship / assessments / safeguarding
                                           └─ core audit + idempotency + transactional outbox
```

`apps/web` is the public marketing site. `apps/portal` is the authenticated
product surface. `packages/ui` owns shared visual primitives and tokens.

## Module boundaries

- `identity` owns authentication identity, roles, capabilities, and scope resolution.
- `placements` owns the placement aggregate, assignments, lifecycle, and guards for child writes.
- Child modules call placement APIs/ports; they do not write placement state directly.
- `core` owns platform concerns: UUIDs, audit, errors, idempotency, and outbox.
- Analytics and notifications are leaves. Notifications execute domain events and never decide business rules.
- Cross-module writes occur through services; reads use selectors or explicit module APIs.

### Django implementation boundaries

- ORM models contain fields, relationships, database constraints, and narrowly
  framework-required manager behavior. They do not own account, authorization,
  workflow, or notification business rules.
- `serializers.py` modules validate and normalize API input/output contracts.
- `views.py` modules are transport adapters: authenticate/authorize at the HTTP
  boundary, call services, and return the versioned response envelope. They do
  not contain domain decisions or direct cross-module writes.
- `services.py` or a module's service package owns business rules and transaction
  orchestration. Services call explicit module APIs rather than importing another
  module's models for writes.
- Background workers consume outbox events through notification services. They
  never decide role, scope, placement, or authorization policy.
- Imports must follow the module graph. Layer-0 identity/core code cannot import
  upward into institutions, facilities, or domain modules; leaf notifications
  may consume published event contracts but do not call domain models directly
  to make business decisions.

## Data and consistency

- PostgreSQL is required in development and tests because constraints, triggers, ranges, and partial indexes are part of the design.
- Operational records are not hard-deleted.
- State transitions lock the aggregate and re-check guards under the lock.
- Every command is one transaction: domain write + audit + outbox + idempotency result.
- External I/O happens after commit through the outbox.

### Background processing and ephemeral state

PostgreSQL remains the durable source of truth for identity, audit, sessions,
and outbox events. Redis is used for cache, rate limits, short-lived MFA state,
and Celery broker/backend state. Celery worker and beat processes reconcile the
outbox automatically; the management command remains a local/operator entrypoint
and recovery tool, not a required per-email production action.

## API conventions

- Reads use scoped resource endpoints.
- Writes use named command endpoints, not generic CRUD updates.
- Session authentication and CSRF protection are used for the PWA.
- Scope is derived server-side on every request.
- Scope misses are intentionally non-disclosing.
- Error codes and `retryable` are versioned client contracts.
- `GET /api/v1/commands/{command_id}` reconciles a lost response without retrying a write blindly.

## First implementation slice

The first bounded product slice is the mentor workflow:

1. Authenticated portal shell and `/me` capability bootstrap.
2. Mentor Today view showing only assigned active work.
3. Placement detail and induction checklist.
4. Session form with server validation and mapped errors.
5. Durable local queue, retry, idempotency, and Needs attention reconciliation.

The portal must consume server-provided capabilities and transition availability;
it must not duplicate domain rules in the client.

## Security and privacy constraints

- No patient-identifiable fields.
- Sensitive escalation text is field-restricted and never placed in events or list responses.
- Feedback anonymity is structural: anonymous feedback has no placement/student relation.
- Mentor-visible aggregates enforce minimum-n suppression per displayed figure.
- Authorization is enforced in services, not by hidden UI controls.

## Source documents

This file canonicalizes the approved design sequence. Detailed decisions remain in
`docs/architecture/decisions/` and the Stage 3–8 architecture documents.
