# ADR 0015 — Role-owned portal workspaces behind an authenticated router

**Status:** Accepted · **Date:** August 2026 · **Stage:** Frontend architecture

## Context

The portal originally selected every authenticated dashboard directly in
`App.tsx`. Feature UI had started to move into folders, but `App.tsx` still knew
which role rendered Programme Admin, Coordinator, Nurse Manager, Mentor, Student,
and shared placement screens. That couples session bootstrap to role page
composition and makes each additional route another root-level conditional.

## Decision

`App.tsx` is a session/bootstrap boundary only. An `AuthenticatedRouter` resolves
the signed-in role to a role-owned workspace entry point. Each role workspace
owns its dashboard and the routes it exposes; shared domain features remain in
their existing feature modules and receive the authenticated user/capabilities as
inputs.

```text
session bootstrap → authenticated router → role workspace → shared feature
```

Role workspaces are:

- `programme-admin` — programme dashboard and placement-management entry;
- `coordinator` — institution dashboard and placement-management entry;
- `nurse-manager` — facility dashboard and placement-management entry;
- `mentor` — mentor participant workspace;
- `student` — student participant workspace.

The frontend is not an authorization boundary. The backend remains authoritative
for all scopes, capabilities, transitions, and commands.

## Consequences

- Root composition no longer expands as role pages grow.
- Each role has a discoverable home for dashboard navigation and future pages.
- Placement, induction, mentorship, and account features can remain shared where
  their behavior is actually shared.
- The current lightweight history-based navigation remains in place; adopting a
  routing dependency is deferred until deep-linking and nested route needs justify
  it.

## Rejected

**Duplicating shared feature screens into every role folder.** It would duplicate
access-sensitive UI while server capabilities already express the meaningful
differences.

**Keeping all role routing in `App.tsx`.** This obscures workspace ownership and
creates an ever-growing root switchboard.
