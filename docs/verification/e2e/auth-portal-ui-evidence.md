# EVIDENCE-001 — Portal authentication UI states

Requirement(s): Authentication lifecycle UX, account recovery error handling,
account status communication

Platform/device/browser: Chromium 151, desktop viewport 1440×900, Vite portal
at `http://127.0.0.1:5175`

Starting state and test data: Frontend-only verification with deterministic API
stub for the password-reset `503` response. Backend services were unavailable,
so no real credentials or personal mailbox were used.

Journey steps:

1. Open the invitation route.
2. Open password recovery and submit an email while the API returns `503`.
3. Open suspended account status.
4. Open the root route while the backend is unavailable.

Expected result:

- Invitation landing renders with the MentorMAMA hierarchy.
- Recovery shows a safe, retryable service message and preserves the form.
- Suspended accounts receive an intentional status explanation and next action.
- Sign-in renders with a safe backend-unavailable message rather than a raw 500.

Observed result:

- PASS — invitation landing
- PASS — password reset outage UX
- PASS — suspended account status
- PASS — sign-in fallback
- Browser console reported six failed network requests from the unavailable
  backend; the visible UI handled the resulting state safely.

Result: PASS for frontend UI states; backend-dependent lifecycle remains pending
until PostgreSQL and the backend runtime are available.
