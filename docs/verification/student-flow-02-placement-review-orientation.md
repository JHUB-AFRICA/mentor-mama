# Student flow 02 — placement review and orientation

## User path

1. The student sees their placement only after the placement list is loaded.
2. For an assignment awaiting confirmation, the portal checks the live allowed
   transitions and makes the student review the facility, ward, mentor, dates,
   and expectations before confirming.
3. A failed transition check offers retry and does not imply that confirmation
   is available. A failed confirmation keeps the review open. If the save works
   but the follow-up refresh fails, the page says the confirmation was saved
   and asks the student to reload.
4. After confirmation, the placement enters orientation. The student reviews
   the guide and confirms each required acknowledgement.
5. Orientation status is read from the API. A failed status check blocks a
   duplicate acknowledgement and offers retry. A saved acknowledgement appears
   as complete after navigation or reload. Repeated submissions reuse the
   existing acknowledgement instead of emitting duplicate audit/outbox events.
6. Once orientation is acknowledged, the student waits for their mentor to
   continue with induction. The portal does not claim induction is complete.

## Source changes

The API now exposes a student-scoped orientation acknowledgement read on the
existing orientation resource. The acknowledgement command is idempotent at the
domain level, even when a retry uses a new request key. The Student screen
checks acknowledgement status, shows completion after refresh, reports a
success toast, and handles follow-up refresh failure. Loading placements before
rendering the authenticated Student workspace avoids a brief false empty state.
The Student support page now selects a placement when its list arrives after
mount. Endline assessment values start blank so the form cannot submit example
ratings as if the student chose them. Feedback, safeguarding, and final
assessment submissions provide success toasts.

The mentorship-session history now keeps successfully loaded placement records
visible when another placement's session request fails, marks that view as
possibly incomplete, and lets the student retry all placements. It shows the
full unavailable state only when every placement request fails.

## Verification still required

The backend API contract test was extended to cover orientation status before
and after acknowledgement and to ensure a duplicate submit creates only one
acknowledgement/outbox event. Run it with PostgreSQL available. Then use an
isolated Student account to verify placement readiness, review contents,
confirmation failure/retry, saved-but-refresh-failed state, orientation status
failure/retry, acknowledgement retry, mentor handoff, and the 375px/desktop
layouts. Do not use Programme Admin actions to impersonate a Student.
