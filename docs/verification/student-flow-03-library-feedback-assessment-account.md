# Student flow 03 — library, support, close-out, and account settings

## Acceptance journey

1. Open the learning library from desktop navigation and mobile navigation.
2. Open a guide, document, external resource, and learning module; return to the
   library. The Student stays in the Student workspace and can only fetch
   programme content visible to the Student role.
3. Submit confidential feedback and a safeguarding concern. A failed response
   preserves the form and retrying the same unchanged submission reuses its
   command key; editing the form starts a new command.
4. Open a placement whose close-out date has passed. The page reads final
   assessment status from the API, offers a retry if that read fails, and
   preserves answers and its command key after a failed submission.
5. Open profile, notification, security, and signed-in-device settings. Read
   failures are distinct from empty or disabled states and provide retry where
   the user can recover.
6. Repeat at desktop and narrow mobile widths; check navigation, keyboard
   access, toasts, failed requests, and that another role's cached content does
   not flash into the Student library.

## Source review and changes

- Student and Mentor library entries now open detail routes in their own
  workspace. Module detail reads use the role-filtered endpoint for
  non-administrators. Query cache keys include the user and role, and
  management actions are hidden from non-administrators.
- The Student mobile navigation now includes the library. Placement detail
  remounts when the selected placement changes, so a previous placement's local
  state cannot carry over.
- Account overview uses the authenticated role and reports whether programme
  access is assigned; it no longer labels every account as a Programme
  Administrator or invents an “E2E Programme” name. The security heading no
  longer guarantees that an account is secure before its state has loaded.
- A failed final-assessment status read now has a visible retry path for
  close-out eligible placement states. Final assessment, feedback, and
  safeguarding submissions retain one idempotency key through a retry and
  rotate it when the submitted values change.
- `reportError` is now stable across app renders. This prevents failed profile,
  notification, and authenticator reads from restarting solely because a toast
  rerendered the application. Student profile read errors remain inline, and
  notification preferences now have an explicit retry state. Account security
  distinguishes unavailable authenticator/device data from “not configured”
  or “no devices.”
- Feedback and safeguarding buttons now prevent repeat clicks while a request is
  in progress. The Student account page no longer displays a static “Account
  active” label that could become stale during an existing session. Final
  assessment success copy now describes the data that was actually saved.

## Privacy finding requiring resolution

The anonymous-feedback implementation does not currently meet the accepted
ADR 0008 unlinkability statement at the database level. `FeedbackAnonymous`
inherits exact `created_at`/`updated_at` timestamps from `BaseModel`; the
generic idempotency row stores both the submitting user and the anonymous
feedback ID; the audit entry stores the actor and feedback ID; and an outbox
event stores the feedback ID with an exact occurrence time. The feedback table
itself has no placement/student foreign key, but these surrounding records
provide a correlation path. The anonymous path now fails closed with a
plain-language 409 response, and the portal disables the choice while explaining
why. This avoids claiming anonymity that the surrounding records cannot
currently guarantee. A privacy-preserving idempotency, audit, timestamp, and
event design still needs approval and implementation before anonymous feedback
can be re-enabled or the Student flow accepted. The approved product contract
should not be weakened by UI copy.

## Verification result

Result: **BLOCKED** for real-user acceptance. `sinaps health` reports Docker
unavailable, no app listeners, and 7% free disk. The VERIFY gate therefore
does not permit resource-heavy builds or browser journeys. No invitation email,
database-backed submission, desktop/mobile rendering, or E2E pass is claimed.
Re-run the numbered journey from a clean, isolated Student account when the
local services and browser are available. Resolve the anonymous-feedback
linkage before marking Student acceptance complete.
