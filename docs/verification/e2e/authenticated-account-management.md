# EVIDENCE-002 — Authenticated account-management journey

Requirement(s): Invitation activation, MFA enrollment, recovery-code handling,
profile management, MFA recovery escalation, session logout

Platform/device/browser: Chromium 151, desktop viewport 1440×900, local Django
backend, PostgreSQL 16, Redis 7, Vite portal

Starting state and test data: Dedicated local-only Programme Admin account
`e2e-admin@mentormama.test`; no production credentials or mailbox used.

Journey steps and observed result:

1. Sign in — PASS
2. Enable MFA using a real TOTP generated from the setup secret — PASS
3. Confirm recovery codes and enter workspace — PASS
4. Update profile phone contact — PASS
5. Submit MFA recovery request — PASS
6. Sign out — PASS
7. Request password reset and receive neutral confirmation — PASS
8. Open the generated reset capability, set a new password, and receive
   completion confirmation — PASS

Result: PASS

Evidence artifact: `/tmp/mentor-mama-authenticated-e2e.png`

Implementation note: The first run exposed a real SPA/CSRF boundary issue.
Development trusted origins now include the portal ports, and the API obtains
the CSRF cookie before authenticated mutating requests. The journey passed
after that fix.

Additional verification:

- Mailtrap Sandbox: two messages delivered for the dedicated local account
  (invitation and password reset); no other outbox recipients were dispatched.
- Fresh sign-in with the reset password, TOTP challenge, session inventory, and
  sign-out — PASS.
