# Final assessment and placement close-out

**Status:** Implemented — student final assessment command and close-out surface

## User journey

1. A student opens an assigned placement after its effective end date.
2. The portal loads the server-owned final-assessment status.
3. The student submits an endline confidence score from 0–100 and an overall
   experience rating from 1–5.
4. The server records an immutable exit survey and final-confidence assessment
   in one idempotent command.
5. The placement completion blocker clears; an authorised operational user can
   complete the placement subject to safeguarding blockers.

## Rules represented

- Before the effective end date, submission is rejected with
  `AssessmentOutOfWindow`.
- Only the assigned student can submit.
- Submitted assessments are append-only and cannot be edited or deleted.
- Every submission carries an idempotency key and creates audit/outbox records
  in the same transaction.
- The portal renders the action from the API status; it does not decide whether
  completion is allowed.

## States

- Loading: the status request is pending and no submission action is shown.
- Ready: the final form is available.
- Submitted: a confirmation replaces the form.
- Error: the shared API error is shown through the participant workspace notice.
