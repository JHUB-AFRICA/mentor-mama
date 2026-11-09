# ADR 0016: Email OTP as a secondary MFA factor

**Status:** Accepted for implementation  
**Date:** 15 September 2026  
**Decision owners:** Identity, Security, Platform

## Context

MentorMAMA currently uses a custom DRF/session authentication flow with
`django-allauth` MFA primitives for TOTP and recovery codes. Privileged roles
(Programme Admin, Coordinator, and Nurse Manager) must complete MFA before
their workspace session becomes trusted. The portal is a React SPA and
transactional email is delivered through the platform outbox/notification
boundary.

Some users need a second factor that does not require an authenticator app.
Email OTP is acceptable as a lower-assurance fallback, but it must not replace
TOTP, weaken the pending-MFA session boundary, or bypass the existing audit and
notification controls.

## Decision

Adopt `django-otp`'s `otp_email.EmailDevice` as the reusable email-token
primitive. Do not adopt `django-two-factor-auth`'s complete login flow and do
not replace the existing allauth TOTP implementation.

MentorMAMA owns the orchestration layer:

```text
password accepted
  -> pending MFA session
  -> factor selection (TOTP or email OTP)
  -> factor verification
  -> existing MFA_VERIFIED_SESSION_KEY = true
  -> existing UserSession inventory and role access
```

`django-otp` supplies token generation, expiry, cooldown, throttling, and
single-use verification. MentorMAMA supplies session binding, role policy,
outbox delivery, audit events, API responses, and portal UX.

## Factor policy

- TOTP remains the preferred factor for privileged roles.
- Email OTP is an explicitly selected fallback factor.
- Email OTP requires `email_verified_at` to be set.
- Recovery codes remain available and are not replaced by email OTP.
- Email OTP is never accepted to disable TOTP, change the email address, or
  perform MFA recovery without a separate verified step-up policy.
- A successful email OTP verifies only the current pending login session.
- No trusted-browser bypass is introduced by this change.

## Data and security boundaries

The `EmailDevice` record is linked to the existing custom `identity.User`.
Tokens are generated and verified by `django-otp`. The package stores the
currently active token on the device row until expiry or successful use, so
production database access must remain restricted and encrypted backups must
be governed accordingly. Raw tokens are never stored in MentorMAMA audit
records, logs, analytics, outbox payloads, or API responses. The device is
created only after the user has a verified email and explicitly enables the
factor.

The pending Django session remains authenticated but untrusted until the
factor succeeds. Existing authentication middleware continues to reject
protected application requests while `MFA_VERIFIED_SESSION_KEY` is false.

Email delivery is adapted to the transactional outbox. The outbox payload
contains a short-lived delivery reference and recipient, not an audit record
or analytics event containing the token. The notification renderer receives
the token only at delivery time.

## API contract

```text
POST /api/v1/auth/mfa/email/setup
DELETE /api/v1/auth/mfa/email/setup
POST /api/v1/auth/mfa/email/challenge
POST /api/v1/auth/mfa/email/verify
```

Login challenge endpoints operate only on the current pending-MFA session.
Account setup/removal endpoints require an authenticated, fully verified
session and a recent step-up check.

All state-changing requests retain the existing `Idempotency-Key` contract.
Challenge creation is idempotent for the same command key; verification is
single-use and safe to retry after a successful response.

## Failure and abuse controls

- Five-minute token validity, subject to the package setting.
- One-minute resend cooldown, subject to the package setting.
- Package throttling for failed verification attempts.
- Application rate limits by user, source IP, and pending session.
- Generic responses that do not reveal whether an account or factor exists.
- Old pending email challenges are invalidated when a new one is issued.
- Every issue, resend, success, failure, disable, and throttle event is
  auditable without including the OTP.
- Outbox retry may deliver a duplicate message, but the same token remains
  bounded by its expiry and one-use verification.

## Alternatives rejected

### django-allauth email login code

Allauth supports email-code login, but that is a passwordless login method,
not a second factor after password authentication. Allauth's MFA supported
types are recovery codes, TOTP, and WebAuthn.

### django-two-factor-auth

It provides a complete browser login wizard and expects its login routes and
middleware to own the two-factor flow. That conflicts with MentorMAMA's custom
DRF endpoints, React portal, pending-MFA session state, outbox, and role-owned
policy.

### Bespoke OTP implementation

Rejected because it would duplicate token generation, expiry, cooldown,
throttling, and single-use security logic already maintained by `django-otp`.

## Rollout and verification

1. Install and pin `django-otp`.
2. Add the email-device migration and settings.
3. Implement the outbox adapter and identity services.
4. Add API and portal factor selection.
5. Test expiry, replay, throttling, idempotency, email delivery, and session
   isolation.
6. Run live role journeys for Programme Admin, Coordinator, Nurse Manager,
   Mentor, and Student.
7. Enable email OTP for pilot users only after delivery observability is
   confirmed.
