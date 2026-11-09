# EVIDENCE-003 — Portal placement and error-state regression

Requirement(s): Authenticated portal access, Placement Management route,
password-recovery privacy, sign-out, and protected-request handling.

Platform/device/browser: Chromium via Playwright, desktop viewport, local Django
backend, PostgreSQL 16, Redis 7, Vite portal.

Starting state and test data: Dedicated local-only Programme Admin account
`e2e-admin@mentormama.test`; local test password and TOTP secret were reset for
this run. No production or personal credentials were used.

Journey results:

1. Signed-out portal loads — PASS. No protected-request failures observed.
2. Unknown-account password recovery — PASS. The user receives the neutral
   “Check your inbox” confirmation without account enumeration.
3. Programme Admin login with TOTP — PASS.
4. Dashboard settings/access-policy/session views — PASS.
5. Authenticated `/placements` route — PASS. Shared portal shell rendered
   without failed API responses.
6. Create placement — PASS. The Programme Admin selected an enrolled student,
   valid dates, and created the placement through the UI.
7. Allocate ward and assign mentor — PASS. Both idempotent commands completed
   and the detail view refreshed with placement history.
8. Invalid sign-in — PASS. The inline error rendered and the user remained on
   the sign-in page.
9. Sign-out from the portal shell — PASS. User returned to sign-in.

Verification commands:

- `pytest -q backend/tests` — PASS.
- `npm run lint` — PASS.
- `npm run build` — PASS.
- `npm run e2e` — 4 passed serially. The suite is intentionally serial because
  the authenticated journeys share one local MFA account.
- `git diff --check` — PASS.

Environment note: the host verification environment reports high swap usage and
15% free disk, so future browser runs should remain scoped and avoid parallel
resource-heavy jobs. Browser verification found that the shared request helper
dropped `Content-Type` when adding an idempotency header, causing placement
commands to return 415. The request merge order was corrected and the full
journey passed afterward.
