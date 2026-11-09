# ADR 0014 — Focused Frontend Authentication Tooling

**Status:** Proposed  
**Date:** 2026-08-24  
**Decision owners:** Sinaps product, UX, architecture, and development

## Context

MentorMAMA's portal needs invitation activation, password recovery, MFA,
profile, session, and role-scoped account-management interfaces. These flows
need accessible form validation, consistent feedback, icons, and responsive
overlays without introducing a large UI framework or a second application
architecture.

## Decision

Retain React + TypeScript + Vite + Tailwind + `packages/ui`, and add:

- `lucide-react` for one consistent SVG icon family;
- `react-hook-form`, `zod`, and `@hookform/resolvers` for forms and runtime validation;
- `sonner` for centralized toasts;
- selected Radix primitives for Dialog, Popover, and Tooltip behavior;
- `qrcode.react` for MFA `otpauth` enrollment rendering;
- `@tanstack/react-query` for server-state caching, invalidation, and mutations;
- `@playwright/test` and `axe-playwright` for the browser/accessibility verification gate.

A motion library remains deferred until CSS transitions cannot express an
approved interaction. Redux and a complete UI kit are explicitly not selected.

## Consequences

Feature folders own their API modules, schemas, pages, and components. Shared
visual primitives remain in `packages/ui`; shared transport and accessibility
helpers live under `apps/portal/src/lib`. This keeps authentication logic
separate from visual components and makes later domain work predictable.

## Revisit conditions

- Add a motion library only when CSS transitions cannot express an approved interaction.
- Reconsider a broader component system only after the shared UI package has documented gaps.
