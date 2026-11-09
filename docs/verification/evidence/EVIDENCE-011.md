# EVIDENCE-011 — Student confirmation and orientation handoff

Requirement(s): T-06, T-08, student placement confirmation, and orientation
handoff.

Implemented and verified:

- A student can sign in and see only their assigned placement projection.
- The confirmation action is available only when the server exposes the
  `confirm_placement` capability and `Awaiting Student → Orientation` action.
- Confirmation is committed through the guarded placement command and the
  student is shown the orientation handoff with facility, mentor, placement
  window, and next step.
- A resettable development-only fixture creates the real authority sequence:
  Coordinator creates and releases; Nurse Manager assigns ward and mentor;
  Student confirms.

Verification:

- Dedicated serial Playwright student journey passed.
- The journey covered student login, scoped placement visibility, confirmation,
  transition to Orientation, and orientation details.
- Full backend regression, portal lint/build, and diff checks pass.

Result: PASS for the student confirmation/orientation gate. Mentor induction,
checklist completion, and session entry remain the next participant workflow.
