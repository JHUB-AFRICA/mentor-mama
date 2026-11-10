# Troubleshooting

## I cannot sign in. What should I check?

If you see "Invalid email or password.", check the email address and password, or reset your password. If you see "Finish setting up your account from the invitation email", you have not activated yet; use your invitation link. If your account is paused or no longer active, a reset will not help; contact your Programme Administrator. Too many attempts are limited, so wait and try later.
<!-- source: backend/apps/identity/views.py, backend/config/settings/base.py -->

## My invitation link says invalid or expired.

Invitation links last 48 hours and a newer invitation replaces the older one. Ask your programme team (a Programme Administrator) to resend. If the resend limit was reached, contact programme support.
<!-- source: backend/apps/identity/authentication.py, backend/apps/core/errors.py -->

## My password reset link does not work.

Reset links last one hour, work once, and stop working if you request another. Ask for a new reset link from the sign-in page. If recovery is "temporarily unavailable", try again shortly.
<!-- source: backend/apps/identity/views.py, backend/config/settings/base.py -->

## My sign-in code or email code is rejected.

Authenticator codes change every 30 seconds, so check that your phone's clock is correct and use the newest code. Email verification codes last 15 minutes; email sign-in codes last 5 minutes and need a short wait between requests. A recovery code can be used once.
<!-- source: backend/apps/identity/authentication.py, backend/config/settings/base.py, backend/apps/identity/views.py -->

## I lost my authenticator app.

Use a saved recovery code. If you have none, request MFA recovery from the sign-in help screen; a Programme Administrator reviews it. Programme Administrators with no peer should contact platform support.
<!-- source: docs/ux/screens/14-mfa-recovery.md, backend/apps/identity/views.py -->

## I was signed out unexpectedly.

Sessions last about 12 hours, and a password reset, MFA recovery, suspension or deactivation signs you out everywhere. Sign in again. You can see your active devices in Settings.
<!-- source: backend/apps/identity/views.py, docs/architecture/authentication-and-account-lifecycle.md -->

## I see no placements.

A student sees "Your placement will appear here" until the programme team releases a placement to them. Draft and Scheduled placements are not visible to students or mentors. If you were expecting one, ask your coordinator whether it has been created and released.
<!-- source: apps/portal/src/features/student/StudentOverview.tsx, docs/architecture/stage3-business-rules-and-invariants.md -->

## I cannot open the student, library item or placement I was linked to.

You may see "Not found." The system gives that message when something is outside your institution, facility or role, without saying if it exists. Check you are signed in to the right account.
<!-- source: backend/apps/core/errors.py, docs/architecture/stage3-business-rules-and-invariants.md -->

## I cannot reach the Overview or other student pages.

Students must complete their profile first. Choose "Open my profile" and fill in course, year of study and emergency contact details.
<!-- source: apps/portal/src/features/student/StudentWorkspace.tsx -->

## My signature is not accepted when I sign the placement.

Type your full name exactly as it appears on your account (capitals and extra spaces do not matter). You will see "Enter your full name as it appears on your account" if it does not match. If it says the placement was already acknowledged, it has been signed and can only be viewed.
<!-- source: backend/apps/placements/services.py, backend/apps/core/errors.py -->

## "Continue to sign" is greyed out.

Scroll to the very end of the assignment document first, then tick "I have read and reviewed the placement assignment".
<!-- source: apps/portal/src/features/student/StudentPlacementDetail.tsx -->

## I cannot log a session.

Check that the student's placement is Active (induction signed), that the date falls within the placement and not in a pause, and that you picked at least one topic and wrote what was covered. Messages you may see: "This placement is not active.", "That date is outside the placement period.", "Some required details are missing."
<!-- source: backend/apps/core/errors.py, apps/portal/src/features/mentorship/SessionLogForm.tsx -->

## I cannot start induction for a student.

The student must acknowledge their own orientation first. In group induction such students show "Waiting for student orientation acknowledgement"; request reminders. If no induction checklist is published for the programme, induction cannot open; contact your Programme Administrator.
<!-- source: apps/portal/src/features/mentor/MentorInductionBatch.tsx, backend/apps/placements/services.py -->

## My final assessment is not available yet.

It opens only when your placement is Active or Paused and its end date has been reached. If you see "Your final assessment is available after your placement becomes active and its end date has passed", wait for the end date. If it says it was already submitted, it can only be submitted once.
<!-- source: backend/apps/core/errors.py, apps/portal/src/features/assessments/FinalAssessmentForm.tsx -->

## I cannot see a training module.

Training is for clinical mentors only. A module appears only when it is published and shared with mentors in your programme. If the list says "No training is published yet", your programme team has not published any. Drafts and archived modules are hidden.
<!-- source: apps/portal/src/features/training/TrainingWorkspace.tsx, backend/apps/content/views.py -->

## A placement cannot be released to the student.

A coordinator or administrator may see "The assigned mentor has not completed required training." The mentor must finish all required, published modules, or the programme setting must be changed. The placement also needs a student, ward and mentor assigned (Scheduled).
<!-- source: backend/apps/placements/services.py, backend/apps/core/errors.py -->

## A placement cannot be completed.

Completion needs a submitted final assessment and no open safeguarding concern. You will see "The final assessment has not been submitted." or "This placement cannot be completed while a concern is still open."
<!-- source: backend/apps/core/errors.py -->

## A ward says it is at capacity.

Wards have a maximum number of students counting Orientation, Induction, Active and Paused placements. Choose another ward, or ask the Programme Administrator to review the ward's capacity.
<!-- source: backend/apps/core/errors.py, docs/architecture/stage3-business-rules-and-invariants.md -->

## A page shows an error or "This record changed since you loaded it".

Reload the page. If a record changed while you were editing it, reload to see the latest version and retry. If the problem continues, note the time and what you were doing and tell your Programme Administrator.
<!-- source: backend/apps/core/errors.py, apps/portal/src/components/PortalErrorState.tsx -->

## My export download does not work.

Export links last 15 minutes after the file is ready. If you see "This export file is no longer available", request a fresh export. Exports are limited to a date range of about a year.
<!-- source: backend/apps/core/errors.py, backend/apps/analytics/export_service.py -->

## Menta is not showing or says it is busy.

Menta appears only when AI is switched on for the programme. It allows 40 questions an hour, and messages up to 600 characters. Messages containing email addresses or long numbers are refused.
<!-- source: .sinaps/state.md, docs/decisions/0027-menta-ai-buddy.md -->
