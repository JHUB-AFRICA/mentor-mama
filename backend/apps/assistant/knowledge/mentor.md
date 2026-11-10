# Clinical Mentor guide

## What screens do mentors have?

The Mentor menu has: Overview, Students, Log session, Training, Library, More and Settings. On a phone the bottom bar shows Overview, Students, Log and More; Training and Library are reached from the menu button. The bell icon shows notifications.
<!-- source: apps/portal/src/features/workspaces/RoleWorkspaceFrame.tsx -->

## What do I see on my Overview?

Overview is your starting point. It has quick actions "Group induction" and "Log a session", a mentorship summary (assigned students, students waiting for induction, placement coverage, currently active placements), a search box for student, ward or cohort, and action rows such as "Review orientation" or "Complete induction". If it says "No induction work waiting", nothing needs you right now.
<!-- source: apps/portal/src/features/mentor/MentorToday.tsx -->

## Where do I find my students?

Open Students to see the students assigned to you, then open a student to see their placement record. You only see students on placements you are currently assigned to.
<!-- source: apps/portal/src/features/mentor/MentorStudents.tsx, docs/architecture/stage3-business-rules-and-invariants.md -->

## How do I run induction for a student?

Induction opens only after the student has acknowledged their own orientation. From Overview, choose "Group induction" (or open the student), select the students who are ready, work through the shared checklist, then sign. Each student still gets their own signed record, and signing activates their placement. You cannot acknowledge orientation or sign for a student.
<!-- source: apps/portal/src/features/mentor/MentorInductionBatch.tsx, docs/product/requirements.md -->

## Can I run induction for a group of students at once?

Yes, for students who attended the same handoff, up to 100 at a time. Answer each required item; use a group answer only when it is true for everyone; handle exceptions in the individual checklist. All selected records are signed together and each one activates only its own placement. Students not yet ready show "Waiting for student orientation acknowledgement".
<!-- source: apps/portal/src/features/mentor/MentorInductionBatch.tsx, docs/product/requirements.md -->

## What if a student has not acknowledged orientation yet?

You cannot start their induction. In the group induction screen you can request reminders for students who are still waiting; the student is notified. You cannot acknowledge on their behalf.
<!-- source: apps/portal/src/features/mentor/MentorInductionBatch.tsx, docs/product/requirements.md -->

## How do I log a mentorship session?

1. Go to Log session.
2. Choose the attendee (search by name). Only students with an Active placement can be chosen.
3. Set the session date and type, optionally the duration, and pick at least one topic.
4. Write what was covered; add feedback given and a follow-up if needed.
5. Choose "Save session".

Never include patient names, identifiers or diagnoses.
<!-- source: apps/portal/src/features/mentor/MentorLog.tsx, apps/portal/src/features/mentorship/SessionLogForm.tsx -->

## Can I log one session for several students?

Yes. Choose several attendees (up to 100) and save once. The notes and follow-up are copied into each selected student's own history, so keep them relevant to the whole group. Attendance is never assumed from assignment, so select only students who were there.
<!-- source: apps/portal/src/features/mentorship/SessionLogForm.tsx, docs/product/requirements.md -->

## What are the rules for session dates?

The date must fall inside the placement period and not inside a pause. The placement must be Active. Saving the same session twice within a few minutes is treated as one record, not an error. If the date is outside the placement you see "That date is outside the placement period."
<!-- source: backend/apps/core/errors.py, docs/architecture/stage3-business-rules-and-invariants.md -->

## What happens if my connection drops while logging a session?

Your draft is saved on your device, and saved sessions wait and sync when the connection returns. Nothing is lost silently; unsynced items stay visible. More shows whether you are online or offline.
<!-- source: apps/portal/src/features/mentorship/SessionLogForm.tsx, apps/portal/src/features/mentor/MentorMore.tsx -->

## Can I edit a session after saving it?

The rules describe a short correction window, but I could not confirm an edit option in the portal today. If a session needs correcting, speak to your nurse manager or programme administrator.
<!-- source: backend/apps/core/errors.py, docs/architecture/stage3-business-rules-and-invariants.md -->

## How does Training work for mentors?

Open Training to see modules, your overall progress and how many required modules are complete. Open a module to read its lessons, then answer the knowledge check and choose "Submit knowledge check". Passing shows "Module complete". If you do not pass, review the lessons and try again.
<!-- source: apps/portal/src/features/training/TrainingWorkspace.tsx -->

## Why does training matter for placements?

If your programme requires it, all Required modules must be complete before a placement assigned to you can be released to the student. Modules marked Required are tagged in your list.
<!-- source: backend/apps/placements/services.py, apps/portal/src/features/training/TrainingWorkspace.tsx -->

## What is the "Explain this lesson" button?

When AI is switched on for your programme, each lesson shows "Explain this lesson". It gives a short explanation based on that lesson only. It is not clinical guidance, and you can use it up to 10 times an hour.
<!-- source: apps/portal/src/features/training/TrainingWorkspace.tsx, .sinaps/state.md -->

## What is in the Library and More for mentors?

Library shows guides, documents and links published for mentors. More shows your connection status, shortcuts to Profile, Notifications and Security, practice tips, and "Open a student record" and "Account help".
<!-- source: apps/portal/src/features/mentor/MentorMore.tsx, backend/apps/content/views.py -->

## How do I raise a safeguarding concern as a mentor?

Open the student's record and use the safeguarding area, describing the concern without naming any patient. It is confidential, goes to authorised reviewers, and Menta cannot handle it. In an emergency, follow your facility protocol and speak to a senior clinician.
<!-- source: apps/portal/src/features/notifications/NotificationPopover.tsx, backend/apps/safeguarding/services.py -->

## What can a mentor NOT do?

Mentors cannot log or edit sessions on placements they are not assigned to, edit another mentor's sessions, read individual feedback about themselves (only grouped figures with at least three responses), sign induction for a student who has not acknowledged orientation, or release or assign placements.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md -->

## What happens next after I sign induction?

The placement becomes Active, the student is told, and you can log sessions for them from Log session.
<!-- source: backend/apps/placements/services.py -->
