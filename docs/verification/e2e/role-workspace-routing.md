# EVIDENCE-005 — Role-owned portal workspace routing

**Requirement(s):** Frontend structure decision; ADR 0015.

**Platform:** Local Chromium through Playwright, local Django/PostgreSQL and
Redis.

**Starting state:** Local DEBUG mentor workflow fixture and no production
credentials or providers.

**Journey:**

1. Signed-out visitor opens the portal without protected-request errors.
2. Visitor completes the neutral password-recovery flow and receives no account
   enumeration signal.
3. Invalid sign-in remains on the sign-in screen with an inline error.
4. An authenticated mentor is routed through the Mentor workspace, opens an
   assigned placement, loses the first session response, and reconciles the
   saved item.

**Expected result:** Public routes remain public; the authenticated router
selects the role-owned workspace; shared placement/session behavior and backend
authority remain unchanged.

**Observed result:** PASS — 4 Playwright journeys passed on 30 August 2026.
The optional Programme Admin MFA journey was skipped because no local enrolled
authenticator secret was supplied.

**Supporting checks:** Portal production build, portal lint, workspace lint, and
`git diff --check` passed.

**Environment note:** The run was explicitly authorized despite the 12% free
disk-space warning. No production provider or credential was used.
