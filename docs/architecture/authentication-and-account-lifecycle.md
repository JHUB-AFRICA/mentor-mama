# MentorMAMA — Authentication, Authorization & Account Lifecycle

**Status:** Implemented for pilot; deferred enhancements recorded below  
**Risk tier:** Major — authentication, account recovery, MFA, and personal data  
**Scope:** MVP web/PWA using secure server-side sessions

## 1. Decisions inherited from the product

- The MVP is a PWA, not a native mobile application.
- Authentication uses cookie-backed server sessions; it does not use JWTs.
- Scope is resolved server-side on every request.
- The client receives capability flags for presentation only.
- Placement and assignment rules remain owned by the domain modules.
- There is no public self-registration in the pilot. Accounts are invitation-based.
- No account or auth flow may introduce patient-identifiable data.
- Phone numbers are optional profile/contact data only in the pilot. They are not
  login identifiers, password-reset destinations, MFA factors, or recovery proof.

## 2. Actors and authority

| Actor | Account scope | Product authority |
| --- | --- | --- |
| Student | One university institution | Confirm own placement, complete orientation, submit own feedback/concerns |
| Clinical mentor | One hospital facility | Access assigned placements, complete induction, log own sessions |
| Nurse manager / ward in-charge | One hospital facility; ward is a filter | Assign/reassign mentors, operate facility placements, review authorised concerns |
| University coordinator | One university institution | Create placements, monitor institutional progress, read approved feedback |
| Programme administrator | Programme-wide | Manage users, organisations, policy settings, recovery and controlled overrides |
| Operational/system administrator | Infrastructure/operations scope, outside the product domain | Deploy, monitor, back up, restore, manage secrets, and provide break-glass support; not a normal product role |
| Notification service | No human scope | Deliver event-driven notifications; never make authorization decisions |

Authorization is evaluated in this order:

1. Is the account active and authenticated?
2. Has the authentication assurance requirement been met (password plus MFA/step-up where required)?
3. Does the account have the server-owned capability?
4. Is the resource inside the account's institution/facility scope?
5. Does the assignment and domain state permit this exact operation?

Failure must not reveal whether an out-of-scope record exists.

The Programme Administrator and Operational/System Administrator are separate
trust domains. Programme Administrators do not receive server, database, Docker,
deployment, secret-store, or Django-superuser access. Operational/System
Administrators do not automatically receive programme-wide business access.
Any emergency business-data access is a time-limited, reason-coded, audited
break-glass action.

## 3. Account state model

Do not overload `User.status` with every authentication condition. Keep business
account status separate from authentication state.

### Business account status

`invited → active → suspended → deactivated`

- `invited`: account record exists but invitation has not been completed.
- `active`: may authenticate if assurance requirements are satisfied.
- `suspended`: authentication rejected; data and audit history retained.
- `deactivated`: no login; historical records remain attributable.

### Authentication state

Derived from verified email, password, MFA enrollment, current session, and
step-up/reauthentication age. It must not be used to change placement authority.

## 4. Lifecycle flows

### 4.1 Invite and account activation

1. An authorised coordinator, nurse manager, or programme administrator creates an invitation with fixed role and scope.
2. The server stores only a hash of a random, single-use, expiring invitation token.
3. The recipient receives a generic activation link.
4. The recipient verifies the email and sets a password using password validators.
5. The server activates the account only if the invitation is still valid and has not been revoked.
6. Role and scope come from the invitation; the client cannot supply or change them.
7. The account enters MFA setup or MFA challenge according to policy.
8. The activation, verification, password set, and MFA events are audited without secrets.

No public registration, role selection, scope selection, or email enumeration is allowed.

### 4.1.1 Initial Programme Administrator bootstrap

Before a Programme Administrator exists, the Operational/System Administrator
uses the one-time `bootstrap_program_admin` management command during deployment.
The command creates only the initial programme-scoped invitation, records a
bootstrap audit event, and publishes an outbox event. It does not create a
password, grant Django staff/superuser authority, or expose a token in terminal
output. The automatic Celery worker sends the invitation through Mailtrap. After
activation and mandatory MFA setup, the Programme Administrator manages all
normal product invitations.

### 4.2 Login

1. User submits email and password over HTTPS.
2. The server returns the same safe failure for unknown, inactive, wrong-password, and locked accounts.
3. Failed attempts are rate-limited and audited without storing the password.
4. If MFA is required/configured, the server creates a short-lived pending challenge.
5. User submits TOTP or a one-time recovery code.
6. The server rotates the session key and establishes a server-side session.
7. The server records login success, assurance level, user agent, and coarse client metadata.

### 4.3 Logout and session revocation

- Logout revokes the current server session.
- Account security provides “log out other sessions” and “log out all sessions”.
- Password reset, account suspension, and deactivation revoke all active sessions.
- Session cookies are `HttpOnly`, `Secure` in production, `SameSite=Lax` unless deployment requires stricter handling, and never exposed to JavaScript.
- Expired database sessions are purged regularly.

### 4.4 Password reset

1. User submits an email address.
2. The API always returns the same response whether the address exists.
3. A single-use, time-limited reset token is emailed only for eligible accounts.
4. The token is hashed at rest and invalidated after use or expiry.
5. The user sets a new password with server-side validators.
6. All existing sessions and pending MFA challenges are revoked.
7. The reset is audited without logging the token or link.

### 4.5 Change password

- Requires the current password and a new password.
- Requires recent authentication for sensitive accounts or when MFA is enabled.
- Uses Django's session-hash update behavior so the current session remains valid while the session key rotates.
- Offers explicit revocation of all other sessions.

### 4.6 MFA and recovery

Recommended pilot policy:

- Programme administrators, coordinators, and nurse managers: MFA required before product access.
- Mentors and students: MFA supported; require it for sensitive account actions and configurable per programme.
- Primary method: TOTP authenticator app.
- Recovery: one-time recovery codes, shown once and stored hashed.
- Passkeys/WebAuthn: architected as an extension, pilot rollout after TOTP and device recovery are proven.
- No SMS OTP as a primary MFA method in the first release; it adds provider, delivery, SIM-swap, and recovery complexity.

The first backend slice uses `django-allauth[mfa]` for the encrypted TOTP and
recovery-code primitives while keeping account creation, login, and API
transport in the `identity` module. Privileged login is deliberately staged:
password authentication creates a pending server session, then the account
must complete TOTP setup or submit an existing TOTP/recovery code before the
MFA-enforced session authentication class permits product endpoints.

Implemented endpoints:

- `POST /api/v1/auth/mfa/setup` — issue an enrollment secret and `otpauth` URI
  to the authenticated pending session.
- `POST /api/v1/auth/mfa/setup/verify` — verify the first TOTP and return the
  one-time recovery-code set.
- `POST /api/v1/auth/mfa/verify` — complete a subsequent login with TOTP or a
  recovery code.

Secrets and recovery codes are never written to audit entries or outbox
payloads. Browser-session inventory is implemented with an
`identity_user_session` table keyed to Django's session key. It records device
label, user agent, IP, creation, last-seen, expiry, and revoke time without
storing session secrets. The API supports listing sessions, revoking one, and
revoking all other sessions; authenticated requests reject revoked or expired
inventory records.

Account status changes are service-owned and scope-checked. Programme
Administrators may suspend, reactivate, or deactivate accounts in their
programme except themselves; Coordinators may suspend students in their own
institution; Nurse Managers may suspend mentors in their own facility. Any
non-active transition revokes every active browser session for the target.
MFA device listing and recovery-code regeneration are self-service; required
roles cannot remove their last TOTP factor through the ordinary endpoint.
Password reset revokes all existing browser sessions, while an authenticated
password change retains only the current rotated session. A Programme
Administrator may review a reasoned request from another active person in the
same programme, but cannot review or approve their own request. A platform
superuser handles Programme Administrator recovery through the restricted
Django administration workflow; that path is cross-program, reasoned, audited,
and unavailable to ordinary Programme Admin accounts. Recovery deletes the
target's MFA authenticators and sessions and forces fresh setup at next sign-in.
- Do not silently trust a device forever. If “remember this device” is later added, it must be short-lived, revocable, bound to a server-side record, and step-up protected.

### 4.7 Device and session management

Treat these as two separate concepts:

- **Browser sessions:** active logins, with device label, last seen, created time, and revocation.
- **MFA authenticators:** TOTP/passkey devices, with label, enrolled time, last used, and revocation.

Users may revoke their own sessions and MFA devices. Programme administrators
may revoke sessions for a suspended/deactivated account, with an audited reason;
they do not read passwords or MFA secrets.

### 4.8 Invitation and session policy for the pilot

The pilot uses the following defaults:

- Invitations expire after **48 hours**.
- Resending an invitation immediately invalidates the previous invitation token;
  only the newest token may activate the account.
- An inviter may resend at most **three times in 24 hours** for the same account.
  Programme administrators may revoke and issue a fresh invitation when support
  intervention is required; this remains audited.
- A browser session expires after **12 hours of inactivity** and has a **7-day
  absolute lifetime**, whichever comes first.
- A successful password change, password reset, MFA change, suspension, or
  deactivation revokes all other active sessions. The current session is retained
  only for an intentional password-change flow and receives a rotated session key.
- The pilot does not offer permanent trusted devices. MFA is required again when
  a new browser session is established after login or when the MFA assurance
  period ends.
- These values are configuration, not business-logic constants, so they can be
  changed after pilot evidence and security review.

### 4.9 Transactional email provider decision

The pilot will use **Mailtrap** for transactional email across environments:

- Development and QA use a dedicated Mailtrap Email Sandbox. Messages are
  captured for inspection and never delivered to real recipients.
- Staging uses a separate sandbox so staging tests cannot pollute development
  results.
- Production uses Mailtrap Email Sending through its HTTPS API with a verified
  project sending domain, authenticated credentials stored as deployment
  secrets, and delivery/bounce webhooks routed into the notification event log.
- The application sends through an internal notification/email service interface;
  authentication flows do not call Mailtrap directly. This preserves the option
  to change providers later.
- Environment configuration selects sandbox versus production by setting or
  omitting `MAILTRAP_SANDBOX_ID`. Production credentials and recipient delivery
  must never be enabled in local development or automated tests.
- The initial sender identity will be a dedicated domain address such as
  `accounts@<verified-domain>`, with a separate reply-to address if support
  responses are required.

Mailtrap Sandbox is appropriate for inspecting activation, reset, MFA, and
security-notification messages. It is not itself a production delivery channel;
production requires domain verification and the Email Sending service.

## 5. Recommended reusable components

| Need | Recommendation | Reason |
| --- | --- | --- |
| User model and password hashing | Keep the existing custom Django `User` and Django auth | Already established and compatible with the domain scope model |
| Account lifecycle/API | Evaluate `django-allauth` headless integration first | Provides headless account operations, email flows, MFA integration, session-token/API options, and an OpenAPI-described API |
| MFA | `django-allauth[mfa]` first choice | Supports TOTP, recovery codes, WebAuthn/passkeys, and configurable MFA types |
| Login protection | Prefer allauth rate limits, backed by a real cache; add `django-axes` only if its lockout/audit model is still needed after integration testing | Avoid duplicate lockout systems and conflicting failure semantics |
| Endpoint-specific rate limits | `django-ratelimit` only where allauth does not cover a sensitive endpoint | Supports IP, user, email-keyed, and method-specific limits |
| Low-level OTP alternative | `django-otp` only if allauth cannot meet a confirmed requirement | It is a framework, not a complete account lifecycle or device-management UI |
| API transport | Keep DRF and cookie sessions for the PWA | Matches ADR 0011 and avoids introducing token authority into the MVP |
| Email delivery | Use the existing outbox boundary and a provider adapter | Auth email side effects must not run inside domain transactions |
| Background work | Celery with Redis broker; PostgreSQL outbox remains durable source of truth | Automatic retries without making Redis the authority for account or audit state |
| Django module boundaries | Serializers validate transport input; views stay thin; services own business logic; models hold schema/constraints | Prevent circular imports and business-rule drift |

The package decision is conditional on compatibility tests against the pinned
Django/Python versions, custom user, DRF session authentication, CSRF, and the
current database migration policy. No package should be installed merely because
it has a convenient feature list.

## 5.1 Approved account authority matrix

| Action | Programme Admin | Coordinator | Nurse Manager | User |
| --- | --- | --- | --- | --- |
| Invite users | All roles | Students in own institution | Mentors in own facility | No |
| Suspend account | Any account except self | Students in own institution | Mentors in own facility | No |
| Deactivate account | Any account except self | Request only | Request only | No |
| Password reset | Trigger/revoke only | No | No | Self-service |
| MFA recovery override | Temporary, audited | No | No | Own account setup |
| Revoke sessions | Any account | Scoped students | Scoped mentors | Own sessions |
| Change password | Own account | Own account | Own account | Own account |
| Manage MFA devices | Own account | Own account | Own account | Own account |

No administrator sees passwords, TOTP secrets, or recovery codes. Local managers
and coordinators cannot change a user's role or organization scope.

## 5.2 Programme Admin versus Operational/System Admin

`Role.PROGRAM_ADMIN` means the product-level Programme Administrator only. It is
not a synonym for Django `is_staff`, infrastructure administrator, database
operator, or deployment owner. Operational access must be controlled outside the
domain role matrix and granted through the hosting/operations identity system.
The existing `is_staff` and `is_superuser` fields require an explicit review so
they cannot accidentally become an application authorization shortcut.

## 6. API surface to design

The final endpoint names may follow the selected package, but the product contract
must cover:

- `POST /auth/invitations`
- `POST /auth/activate`
- `POST /auth/login`
- `GET /auth/session` — non-error session probe used by the SPA before protected data loads
- `GET /notification-preferences`
- `PATCH /notification-preferences`
- `GET /access/policies` — Programme Admin review of the server-owned matrix
- `POST /auth/mfa/verify`
- `POST /auth/logout`
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`
- `POST /auth/password/change`
- `GET /auth/me`
- `GET /auth/sessions`
- `DELETE /auth/sessions/{id}`
- `POST /auth/sessions/revoke-others`
- `GET /auth/mfa/devices`
- `POST /auth/mfa/totp/start`
- `POST /auth/mfa/totp/confirm`
- `DELETE /auth/mfa/devices/{id}`

All mutating endpoints need CSRF protection, safe error envelopes, audit events,
rate limits where applicable, and explicit idempotency treatment where a retry can
send an email or alter security state.

Public authentication endpoints explicitly disable session authentication. This
prevents an already-open, MFA-pending administrator session from being applied
to another person’s activation or password-reset request. They remain protected
by Django CSRF middleware.

### 6.1 Public versus protected endpoints

“Public” means that the request does not require an authenticated product
session; it does not mean that a state-changing request is exempt from browser
security controls. The public authentication boundary is:

| Endpoint | Session required | CSRF on POST | Purpose |
| --- | ---: | ---: | --- |
| `GET /api/v1/auth/csrf` | No | N/A | Issue the browser CSRF cookie |
| `GET /api/v1/auth/session` | No | N/A | Safe signed-out/session probe |
| `POST /api/v1/auth/login` | No | Yes | Establish a session |
| `POST /api/v1/auth/activate` | No | Yes | Consume an invitation and establish a session |
| `POST /api/v1/auth/password-reset/request` | No | Yes | Request recovery instructions |
| `POST /api/v1/auth/password-reset/confirm` | No | Yes | Consume a reset token |

All other account, programme, placement, invitation-management, and audit
endpoints require an authenticated session and server-side authorization. Their
mutations also require CSRF. The SPA obtains the CSRF cookie before every
non-safe public or protected mutation and sends it in `X-CSRFToken`; no endpoint
uses `csrf_exempt` as a shortcut.

## 7. Security acceptance criteria

- Account enumeration is not possible through login, invitation, reset, or verification responses.
- Invitation, reset, MFA, and recovery tokens are random, single-use, expiring, and never logged.
- Wrong-password and wrong-MFA attempts are rate-limited and audited.
- Role/scope cannot be changed by client input.
- Suspended/deactivated users cannot authenticate or use existing sessions.
- Password reset and account deactivation revoke sessions.
- MFA recovery cannot bypass role/scope or domain authorization.
- Sensitive auth responses use `Cache-Control: no-store`.
- Production cookies, HTTPS, CSRF, CORS, security headers, and trusted proxy/IP configuration are tested.
- Every role has positive and negative authorization tests for account management and domain operations.

## 8. Open decisions before implementation

1. Is email the required identifier for every pilot role? **Decision: yes for the pilot; phone is profile/contact data only.**
2. Which roles must have MFA before first product access? **Decision: programme admin, coordinator, and nurse manager; TOTP plus recovery codes.**
3. Who is authorised to invite each role and to revoke/suspend accounts? **Decision: approved authority matrix in section 5.1.**
4. What is the invitation expiry and maximum resend policy? **Decision: 48h expiry; prior token invalidated on resend; max 3 resends/24h.**
5. What session lifetime and inactivity timeout are acceptable for ward-floor use? **Decision: 12h inactivity and 7-day absolute lifetime.**
6. Does the pilot require passkeys now, or is TOTP plus recovery sufficient? **Decision: TOTP plus recovery sufficient; passkeys deferred.**
7. Which transactional email provider and sandbox will be used for verification testing? **Decision: Mailtrap Sandbox for development/QA/staging and Mailtrap Email Sending for production, behind an internal email service interface.**
8. What account audit events must be visible to programme administrators, and what retention applies?

## 9. Sources reviewed

- Django authentication and password management documentation
- Django session security documentation
- django-allauth headless, MFA, user sessions, and rate-limit documentation
- django-otp authentication/device documentation
- django-axes authentication-lockout documentation
- django-ratelimit usage and key documentation

## 10. Recorded decision — phone numbers

Phone numbers may be collected as optional contact information on the profile,
subject to the product's privacy and visibility rules. The pilot will not use them
for authentication, password reset, MFA, login discovery, or recovery. Adding SMS
OTP later will require a new decision covering provider trust, SIM-swap risk,
delivery failure, rate limiting, consent, and recovery fallback.

## 11. Recorded decision — pilot MFA policy

- Programme administrators, university coordinators, and nurse managers must
  complete MFA before accessing the product.
- Clinical mentors may use MFA voluntarily during the pilot, but MFA is required
  for password, email, and authenticator-device changes.
- Students may use MFA voluntarily during the pilot.
- The pilot uses TOTP authenticator apps and one-time recovery codes.
- SMS OTP and permanent trusted devices are deferred.
