# ADR-0020: Authentication experience and authorization hardening

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Users encountered technical language and an unbranded authenticator QR during
account setup. Backup-code acknowledgement, recovery guidance, and session
management also needed clearer user-facing behavior. The API review identified
several domain-boundary checks and session-lifecycle cases that should be
enforced on the server.

## Decisions

1. Use plain language such as “authenticator app,” “sign-in code,” and “backup
   code” in user-facing authentication journeys.
2. Brand the QR within MentorMAMA's setup screen. The authenticator application
   itself controls its own branding and presentation.
3. Offer the setup key only through a deliberate “Can’t scan?” action. Require
   explicit acknowledgement that backup codes were saved before completing
   setup; each code is single-use and is never sent in email or exposed in
   ordinary support views.
4. Keep recovery and account-status screens actionable while retaining generic
   credential errors that do not disclose whether an account exists.
5. Enforce authorization in API views and domain services using active account
   status, capability, programme/organisation scope, and domain rules. Revoke
   sessions when role or scope changes.
6. Rotate the session key after successful MFA, throttle sensitive
   authentication endpoints, and re-check export authority when asynchronous
   work executes.

## Consequences

The setup flow is clearer and provides a verifiable backup-code acknowledgement.
Session and queued-export behavior respond to changed account authority. A full
dynamic authorization matrix and a consistent recent-authentication step-up
policy for optional-factor users remain follow-up work. Runtime verification is
pending the Sinaps resource-health gate.
