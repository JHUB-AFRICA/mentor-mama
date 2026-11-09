# Auth feedback and Student account setup — 2026-11-09

## Findings and changes

- The sign-in page could display the browser's raw `Failed to fetch` text when
  the initial session check could not reach the API. Auth and activation also
  had separate fetch/error parsing paths. These now share the API request
  handler, which returns a plain-language connection message and never shows
  untrusted network exception text.
- API errors now use status-based safe wording when the response is malformed,
  lacks the versioned error envelope, or has a server-error status. Explicit
  API error messages remain available for expected user actions such as an
  invalid sign-in code. Export downloads follow the same network/server rules.
- Unexpected DRF exceptions, unmapped database integrity errors, and internal
  domain errors are logged server-side and returned as retryable generic HTTP
  500 responses. CSRF failures return a stable JSON 403 on API routes without
  exposing Django's debug page or CSRF reason. Wrong passwords return the same
  generic HTTP 401 for active and suspended accounts. A suspended or deactivated
  account is identified only after its password is correct, then the student is
  told that resetting a password will not restore access and how to contact the
  Programme Administrator.
- The auth brand panel hides optional artwork if it cannot load. Invitation
  setup no longer reports “Invitation accepted” before acceptance, no longer
  promises authenticator setup for every role, and gives incomplete links a
  recovery path. Student profile fields required by the workspace gate are now
  marked required; date of birth remains optional.

## Verification evidence

- Portal TypeScript check: pass (`pnpm --filter @mentormama/portal exec tsc --noEmit`).
- Scoped portal ESLint: pass for the changed auth, API, and app files.
- Python compilation and `git diff --check`: pass.
- Safe API exception-handler and HTML-to-JSON middleware checks: pass
  (`backend/tests/test_http_errors.py`, 3 tests).
- Auth login integration test was attempted but could not initialize its
  PostgreSQL test database because the local database service is not running.
- Argent reports no running browser/device target. `sinaps health` reports
  Docker unavailable, no app listeners, and 7% free disk. No live browser,
  invitation email, student account, desktop, or mobile journey is claimed.

## Gate and follow-up

The project remains at VERIFY, tier MAJOR because authentication behavior and
account lifecycle are involved. The source changes do not complete verification
or release acceptance. With services available, verify API 401/403/429/500
responses, offline sign-in and recovery, CSRF rejection, invitation expiry,
student activation through profile completion, then the Student placement
journey at desktop and mobile widths. Keep support channels configured to the
programme's approved contact before production.
