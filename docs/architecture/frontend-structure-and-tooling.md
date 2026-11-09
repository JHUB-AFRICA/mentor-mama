# MentorMAMA Frontend Structure & Tooling Decision

**Status:** Proposed for UX/architecture approval  
**Scope:** React + TypeScript + Vite portal frontend

## 1. Recommendation

Keep the existing React, TypeScript, Vite, Tailwind, and workspace UI package.
Add small focused libraries only where they remove repeated accessibility or
state-handling work:

| Need | Recommendation | Decision |
|---|---|---|
| Icons | `lucide-react` | Adopt; one outline family, tree-shakeable imports |
| Complex forms | `react-hook-form` | Adopt for activation, reset, profile, and admin forms |
| Runtime schemas | `zod` + `@hookform/resolvers` | Adopt; validate API boundaries and form payloads |
| Toasts | `sonner` | Adopt; centralized success/error feedback |
| Accessible overlays | Radix Dialog/Popover/Tooltip primitives | Adopt selectively; do not add a full UI kit |
| MFA QR | `qrcode.react` | Adopt when MFA setup UI is implemented |
| Server state | TanStack Query | Adopt now for profile, sessions, placements, and future domain queries/mutations |
| Motion | CSS transitions first; `motion` only for complex choreography | Defer; auth needs restrained transitions |
| E2E | `@playwright/test` | Adopted; executable suite lives in `apps/portal/e2e/` and runs with `pnpm --filter @mentormama/portal e2e` |
| A11y checks | `axe-playwright` with Playwright | Keep available for the next accessibility gate |

Do not add Redux, a second form library, a second icon family, or a complete
component kit at this stage. TanStack Query owns server state; React context or
local reducers own small client-only UI state. The existing `packages/ui` should remain the
shared visual foundation.

## 2. Frontend directory structure

```text
apps/portal/src/
├── app/
│   ├── App.tsx                 # route composition and providers
│   ├── providers/              # feedback, query, and session providers
│   └── routes.tsx              # public/authenticated route map
├── assets/                     # approved visual assets grouped by surface
│   └── auth/                   # portal authentication artwork; no user data
├── components/
│   ├── feedback/               # ToastHost, InlineNotice, FieldError, Banner
│   ├── forms/                  # Field, PasswordField, OtpField, FormActions
│   ├── overlays/               # Modal, ConfirmDialog, BottomSheet
│   └── navigation/             # PageHeader, Breadcrumbs, AccountMenu
├── features/
│   ├── auth/
│   │   ├── api.ts              # login, activation, reset, MFA requests
│   │   ├── components/         # auth-specific form pieces
│   │   ├── pages/              # invitation, activation, login, reset, MFA
│   │   ├── schemas.ts          # Zod schemas and inferred form types
│   │   ├── state.ts            # pending challenge and intended route
│   │   └── types.ts
│   ├── account/
│   │   ├── api.ts              # profile, passwords, devices, sessions
│   │   ├── components/         # session rows, device rows, status dialogs
│   │   ├── pages/              # profile and security pages
│   │   ├── schemas.ts
│   │   └── types.ts
│   ├── dashboard/
│   ├── facilities/
│   ├── sessions/
│   └── ...
├── hooks/                      # cross-feature hooks only
├── layouts/
│   ├── AuthLayout.tsx
│   └── PortalLayout.tsx
├── lib/
│   ├── http/                   # fetch client, error translation, CSRF/session behavior
│   ├── formatting/             # dates, device labels, role labels
│   └── accessibility/          # focus and live-region helpers
├── services/                   # temporary compatibility facade; migrate by feature
├── store/                      # only durable cross-route client state
└── styles/
    ├── tokens.css              # semantic tokens and motion/reduced-motion rules
    └── index.css
```

`app/App.tsx` owns session loading, public-route selection, and shared error
state. `app/AuthenticatedRouter.tsx` maps an authenticated role to a
role-owned workspace entry point; it does not implement a dashboard itself.
`features/programme-admin`, `features/coordinator`, `features/nurse-manager`,
`features/mentor`, and `features/student` own their dashboard/route composition.

Placement management list/detail screens remain a shared placement feature and
consume the reusable `features/workspaces/PortalWorkspaceLayout.tsx`, so future
placement screens inherit the sidebar/header shell instead of using standalone
full-page wrappers. Induction UI remains under `features/induction`, and the
shared participant placement/session composition remains under
`features/workspaces`. Participant placement history remains isolated in
`features/placements/PlacementHistory.tsx`; role workspaces compose these shared
features rather than duplicating them.

## 3. API ownership rule

Pages do not call `fetch` directly. Feature API modules call the shared HTTP
client, schemas validate external responses, and components render state. This
keeps backend transport concerns out of visual components and avoids circular
feature imports.

## 4. Package policy

Every new dependency must answer one of these questions before installation:

1. Does it remove repeated security/accessibility work?
2. Does it have a narrow responsibility and active official documentation?
3. Does it preserve the existing React/Tailwind architecture?
4. Can we remove it later without rewriting feature logic?

If the answer is no, use the existing platform or `packages/ui` instead.

## 5. Frontend visual contract

The authentication shell uses the shared decorative artwork at
`apps/portal/src/assets/auth/mentor-mama-journey.png` in the desktop brand
panel. It is decorative, contains no instructional text or user data, and is
hidden from assistive technology with an empty alt attribute.

Dot grids and soft wavy background shades remain CSS primitives in
`apps/portal/src/styles/index.css`. New screens must preserve one clear page
purpose, compact but breathable spacing, a deliberate component hierarchy,
visible labels, one dominant action, and stable loading/error/success states.
