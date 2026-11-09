# ADR-0021: Recovery ownership and private content documents

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

The Programme Admin recovery queue included the administrator's own pending request even though the recovery service correctly refused self-review. The Content Library presented document authoring as an upload, but only accepted a URL. Serving uploads from `MEDIA_ROOT` would expose programme materials through Django's development media route and potentially a public media server.

## Decisions

1. Programme Admin recovery lists and review actions are limited to other active people in the same programme. A Programme Admin cannot approve their own request.
2. Platform recovery is a distinct operational path available only to an active Django superuser through Django Admin. It is cross-program, requires a decision and reason, revokes active sessions on reset, notifies the affected person, and records the reviewer and reason in the audit trail.
3. Uploaded PDF, DOCX, and PPTX files are validated server-side, limited to 20 MB, stored outside public `MEDIA_ROOT`, and downloaded only through an authenticated programme- and audience-scoped endpoint. The development Compose stack persists them in a separate named volume.
4. Content revision snapshots keep a reference to the previous uploaded document. Removing the new document fields in a rollback migration leaves the private storage volume intact; administrators must retain it until the rollback decision is final.

## Consequences

Programme Admins get a dedicated recovery inbox and see only requests they are authorized to resolve. Platform account recovery remains outside the product role system. Local and production deployments must back up the private content storage alongside the database. Existing managed document links continue to work.

## Verification and rollback

Migration rollback removes the two document fields; it does not delete files from the private storage directory or volume. Restore the previous application and migration state, then manually remove orphan files only after confirming no database rows reference them. Recovery changes are reversible only through a new audited recovery request; no old authenticator secret is restored.
