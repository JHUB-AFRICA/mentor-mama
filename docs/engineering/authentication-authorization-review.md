# Authentication and authorization review

**Status:** implementation pass complete; runtime verification pending
**Date:** 2026-11-08

## Scope

Reviewed the sign-in and account lifecycle, MFA setup and recovery, invitation
and account status paths, session settings, and protected API views and domain
services. This is a source-level review of the current repository state. It is
not a substitute for endpoint-by-endpoint adversarial testing or a production
security assessment.

## Changes in this pass

- Branded the authenticator setup QR with the MentorMAMA mark, made the manual
  setup key an intentional alternative, and rewrote instructions in plain
  language.
- Added an explicit authenticator success state and require users to confirm
  they saved backup codes before leaving. Explain that each code works once;
  codes are not emailed or shown to support staff.
- Reworded sign-in, recovery, invitation expiry, suspended-account, and security
  settings copy. Session controls distinguish this device and use clear sign
  out actions.
- Preserve the entered sign-in code after verification errors and expose a
  retry path for setup failures.
- Rotate the session key after successful MFA and register the trusted session
  against the new key. Add scoped rate limits to authentication endpoints and
  audit MFA failures without recording submitted codes.
- Invalidate the target's sessions on role or scope changes and notify the
  active user. Recheck export authority when queued work is generated.
- Enforce the existing three-invitation-resends-per-24-hours rule using the
  invitation audit trail and a locked user row.
- Tighten safeguarding facility and escalation scope checks, reviewer checks,
  and quiz submission eligibility.

## Authorization review by API area

| Area | Review result |
| --- | --- |
| Identity and account | Protected views inherit session authentication and active-account checks; role/scope changes now revoke sessions. Public activation and reset endpoints remain intentionally unauthenticated and throttled. |
| Placements and facilities | Reads use actor-scoped selectors; mutations delegate to services that check active assignments and the actor's institution/facility authority. |
| Content, learning, and assessments | Content visibility is role/program scoped; quiz submission now also checks active mentor status, programme, and module visibility. |
| Safeguarding | Tightened facility-only creation, related-escalation visibility, and current reviewer eligibility. |
| Mentorship and notifications | Session and notification reads are bound to the authenticated user or their in-scope relationship. |
| Analytics and exports | Export listing/downloads are owner-bound and export capability is checked both when requested and when queued work is generated. |

The default API policy requires authenticated session access and an MFA-verified
session. Public endpoints are explicit exceptions. Domain services remain the
authority for capability, programme scope, active assignment, and workflow
rules; frontend route guards are not treated as access control.

## Follow-up risks

- Optional-factor users can remove or change an authenticator without a
  uniformly enforced recent-authentication step-up. Define and implement a
  consistent step-up policy for sensitive account changes.
- Login failures are rate-limited, but failed credential attempts are not
  consistently written to the audit log. Add privacy-conscious failure
  telemetry with an explicit retention policy.
- Verify setup-session expiry and recovery behavior against the intended
  security window; current setup state is tied to the authenticated session.
- Confirm all endpoint contracts with dynamic cross-role, cross-programme, and
  inactive-account tests once the verification environment is healthy.

## Verification status

The Sinaps resource health gate reported critically low free disk and Docker
unavailable. No build, test suite, or live UI flow was run in this pass. Source
inspection and documentation are complete; runtime acceptance remains blocked
until the environment is healthy.
