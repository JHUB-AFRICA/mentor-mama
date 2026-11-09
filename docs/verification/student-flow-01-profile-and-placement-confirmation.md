# Student flow 01 — profile and placement confirmation

## User path

1. After sign-in, MentorMAMA checks the student's programme and emergency
   contact details.
2. If the profile is incomplete, the student sees which details to add and can
   open their profile.
3. If that check cannot reach the API, the student sees a connection error and
   retry action. The app must not claim the profile is incomplete or replace
   saved details with an empty form.
4. In profile settings, load failure keeps the form hidden until the saved
   profile is retrieved; retry is available. Save success returns the updated
   completion state and confirms it to the student.
5. For a placement awaiting confirmation, the screen checks whether the domain
   allows confirmation, explains when the team is still preparing the record,
   and provides retry if the check fails.
6. The student reviews the assignment and confirms it. A failed write keeps the
   review open and does not mark the placement complete. A successful write
   refreshes the placement, updates the list, closes the review, and shows a
   success toast. If refresh fails after the confirmation was saved, the UI
   reports that distinction and avoids presenting the old state as actionable.

## Source review and changes

`StudentWorkspace` and `StudentProfileSettings` now distinguish profile-check
failure from incomplete profile data and provide retry. `StudentPlacementDetail`
now distinguishes transition loading, unavailable, and not-ready states. The
confirmation action reports success only after the command succeeds; failed
commands preserve the review state. If the command succeeds but a follow-up read
fails, the UI records the confirmed orientation state locally and tells the
student to reload for the latest record.

The profile form marks the five fields used by the workspace gate as required
and explains why they are needed before continuing. Date of birth remains
optional, matching the profile API. Invitation copy no longer implies every
role must use an authenticator app, and an incomplete invitation link shows a
recovery path before the user enters a password.

## Live acceptance still required

Using isolated Student accounts and placements, verify complete/incomplete
profile, profile-read network failure/retry, save validation/persistence,
confirmation available/not-ready, authorization denial, duplicate submit,
command failure, post-command refresh failure, toast content, and keyboard plus
375px/desktop layouts. Do not use Programme Admin actions to impersonate a
Student. After this flow passes, continue in order with placement journey and
orientation, learning/session record, safeguarding/feedback, endline assessment,
then account and security settings.
