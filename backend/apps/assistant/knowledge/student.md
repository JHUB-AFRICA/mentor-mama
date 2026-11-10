# Student guide

## What screens do students have?

The Student menu has: Overview, My placements, Library, Sessions, More, Profile and Settings. On a phone the bottom bar shows Overview, Placements, Library, Sessions and More. The bell icon at the top opens your notifications, and Settings (bottom of the menu) holds account security, profile and notification choices.
<!-- source: apps/portal/src/features/workspaces/RoleWorkspaceFrame.tsx, apps/portal/src/features/student/StudentWorkspace.tsx -->

## Why am I asked to complete my student profile?

Before you can use Overview, My placements, Library, Sessions or More, you must complete your profile: course name, year of study, and an emergency contact's name, phone number and relationship. A message titled "Complete your student profile" appears with a button "Open my profile". This helps your institution support you safely. If the check fails, you can use "Try again", and your details are not changed.
<!-- source: apps/portal/src/features/student/StudentWorkspace.tsx -->

## What do I see on my Overview?

Overview shows your placements, anything that needs your action, and a "Next step" bar that points to what to do next, for example "Confirm your placement", "Complete orientation" or "Open placement record". It also lists your placements (Placement, Ward, Placement window, Status) and recent activity. If you see "Your placement will appear here", your programme team has not released a placement to you yet.
<!-- source: apps/portal/src/features/student/StudentOverview.tsx -->

## How do I find my placement and see its details?

Go to My placements and open your placement from the table. The placement page has tabs: Overview (facility, cohort, ward, dates, mentor, current stage), Journey (orientation, induction progress and the final assessment), Activity, Documents and Support. A progress bar shows Assigned, Acknowledged, Orientation, Induction, Active and Close-out.
<!-- source: apps/portal/src/features/student/StudentPlacementDetail.tsx -->

## How do I sign my placement acknowledgement?

1. Open your placement from My placements. When it is Awaiting student, choose "Review assignment".
2. Scroll to the end of the assignment, tick "I have read and reviewed the placement assignment", then choose "Continue to sign".
3. Tick the acknowledgement box and type your full name exactly as shown on your account.
4. Choose "Sign and acknowledge". The signing date is added automatically.

Once signed, it cannot be changed; you can reopen it from the Documents tab to view it.
<!-- source: apps/portal/src/features/student/StudentPlacementDetail.tsx, backend/apps/placements/services.py -->

## What happens after I sign the acknowledgement?

Your placement moves to Orientation and you see a confirmation that your acknowledgement was recorded. Your next step is to complete the orientation guide on the Journey tab. After that, your mentor carries out your induction.
<!-- source: apps/portal/src/features/student/StudentPlacementDetail.tsx, backend/apps/placements/services.py -->

## How do I complete my orientation?

Open your placement, go to the Journey tab and choose "Open orientation guide". Read the guide (placement details, emergency process and support, safeguarding and professional conduct), tick the three acknowledgement boxes, optionally add questions or support needs, then choose "Acknowledge orientation". Your mentor is then notified that you are ready for induction. You can close the guide with "Not now".
<!-- source: apps/portal/src/features/induction/OrientationPanel.tsx -->

## What is induction and what do I do during it?

Induction is a checklist your mentor completes with you on your first day at the ward. You do not fill it in. While it is in progress you will see "Induction is in progress" and how many required items are done. When your mentor signs it, your placement becomes Active.
<!-- source: apps/portal/src/features/student/StudentPlacementDetail.tsx, docs/product/requirements.md -->

## Where can I see my mentorship sessions?

Go to Sessions. It lists the sessions your mentor has recorded for you, most recent first, with a search box and a detail panel showing what was covered and any follow-up. It is read only. If it says "No mentorship sessions recorded", your mentor has not logged any yet.
<!-- source: apps/portal/src/features/student/StudentSessions.tsx -->

## Can I log or edit a mentorship session?

No. Only your assigned mentor can log sessions for you, and only while your placement is Active. If something in a session looks wrong, speak to your mentor or your coordinator.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, backend/apps/identity/capabilities.py -->

## How do I submit my final assessment?

Open your placement and go to the Journey tab. When the assessment is available you see "Complete your final assessment". Enter your endline confidence (0 to 100) and your overall experience (1 to 5), then choose "Submit final assessment". It can only be submitted once and only after your placement end date. If it is not showing, see the troubleshooting guide.
<!-- source: apps/portal/src/features/assessments/FinalAssessmentForm.tsx, backend/apps/core/errors.py -->

## How do I give feedback about my placement?

Open your placement, go to the Support tab, and use "Share placement feedback". Choose how it should be handled: Confidential (authorised staff can follow up) or Anonymous (grouped reporting only, never followed up individually). Confidential feedback has a text box. Anonymous feedback is three ratings from 1 to 5 with no comments. Choose "Submit feedback". Submitted feedback cannot be edited.
<!-- source: apps/portal/src/features/safeguarding/FeedbackAndSafeguardingPanel.tsx, backend/apps/core/errors.py -->

## How do I raise a safeguarding concern?

Open your placement, go to the Support tab (or go to More and choose "Open safeguarding"), and use "Raise a private concern". Pick a category and severity, describe what happened without naming any patient, and choose "Submit private concern". It goes to authorised reviewers. It is confidential, not anonymous. For an urgent risk to someone right now, tell a senior person at the facility straight away.
<!-- source: apps/portal/src/features/safeguarding/FeedbackAndSafeguardingPanel.tsx, apps/portal/src/features/student/StudentMore.tsx -->

## What is in the Library?

Library shows guides, documents and links that your programme has published for students. Open an item to read it. If the library is empty, nothing has been shared with students yet.
<!-- source: apps/portal/src/features/content/ContentLibrary.tsx, backend/apps/content/views.py -->

## What is in More?

More holds "When you need help" (Open feedback, Open safeguarding) and account shortcuts: Manage profile, Manage security and Notification preferences, plus the email you are signed in with. If you have several placements you can choose which one first.
<!-- source: apps/portal/src/features/student/StudentMore.tsx -->

## What can a student NOT do?

Students cannot create or change a placement, assign a mentor or ward, complete their own induction, log or edit sessions, see another student's information, or edit a signed acknowledgement or submitted feedback. Anonymous feedback has no comments.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, apps/portal/src/features/safeguarding/FeedbackAndSafeguardingPanel.tsx -->

## What happens next after my placement is Active?

You continue your learning with your mentor, who logs your sessions. When your placement end date arrives, the final assessment opens. Once you submit it, and no safeguarding concern remains open, your nurse manager can complete the placement.
<!-- source: backend/apps/placements/services.py, docs/architecture/stage3-business-rules-and-invariants.md -->

## What does it mean if my placement is Paused?

Your programme team has put the placement on hold with a recorded reason. You cannot have sessions logged while it is paused. When it resumes, your end date is extended by the paused time. You can still share feedback or raise a concern during a pause.
<!-- source: apps/portal/src/features/student/StudentPlacementDetail.tsx, docs/architecture/stage3-business-rules-and-invariants.md -->

## How do I change my profile, password or notification choices?

Choose Profile for your student details, or Settings for account security, profile and notifications. See the account and security guide for details.
<!-- source: apps/portal/src/features/student/StudentMore.tsx, apps/portal/src/features/auth/AccountSettings.tsx -->
