# About MentorMAMA

## What is MentorMAMA?

MentorMAMA is a platform that supports consistent, supportive mentorship for midwifery students during their clinical placements. It brings together students, clinical mentors, ward teams and university coordinators around placement set-up, orientation, induction, mentorship sessions, learning material and feedback.
<!-- source: README.md, docs/product/requirements.md -->

## What MentorMAMA is not

MentorMAMA is an educational and mentorship platform. It is not a clinical record system, and it is not meant to hold patient-identifying information. No part of the system has a place to store patient details, and every free-text box reminds you not to type any. It also does not give clinical advice, so use your facility's protocols and your senior clinicians for care decisions.
<!-- source: README.md, docs/architecture/stage3-business-rules-and-invariants.md, docs/product/requirements.md -->

## Who is MentorMAMA for?

It is for five groups of people: midwifery students, clinical mentors, nurse managers (ward in-charges), university coordinators, and programme administrators. Everyone is invited by the programme; there is no public sign-up. Each person only sees the part of the programme that belongs to their role, institution or facility.
<!-- source: docs/product/requirements.md, docs/architecture/authentication-and-account-lifecycle.md -->

## What can each role do at a glance?

- Student: reviews and signs the placement acknowledgement, completes orientation, reads the library, sees mentorship sessions, shares feedback, raises a private concern, submits the final assessment.
- Clinical Mentor: runs induction, logs mentorship sessions, completes training, reads the library.
- Nurse Manager: assigns wards and mentors, runs placements in their facility, reviews safeguarding concerns, exports facility reports.
- University Coordinator: invites students, manages cohorts, creates and releases placements, monitors progress.
- Programme Administrator: manages people and access, the programme directory, the content library and reports.

<!-- source: docs/product/requirements.md, backend/apps/identity/capabilities.py, docs/architecture/stage3-business-rules-and-invariants.md -->

## Who are the partners behind MentorMAMA?

The project README names JKUAT School of Nursing, JHUB Africa and AfyaVentures as partners. Programme decisions in the design documents were confirmed with JKUAT.
<!-- source: README.md, docs/architecture/stage3-business-rules-and-invariants.md -->

## What is the pilot?

MentorMAMA is being built as a pilot. The first release aims to prove one dependable workflow: an assigned mentor, student induction, a mentorship session, and reliable saving even when the connection is poor. The pilot target is that logging a valid session takes about two minutes. Some features are still being checked, so a few screens may change.
<!-- source: docs/product/requirements.md, .sinaps/state.md -->

## What is not available in MentorMAMA yet?

These are deliberately left out of the first release: a native mobile app, SMS or WhatsApp messages, advanced analytics, in-app negotiation of ward capacity, and more than one mentor on a placement. You use MentorMAMA in a web browser, including on a phone.
<!-- source: docs/product/requirements.md -->

## Who is Menta?

Menta is the AI buddy inside MentorMAMA. It can explain how the portal works, help you find the right screen, and answer from approved material you are allowed to see. Menta can make mistakes, cannot handle safeguarding cases, and never gives clinical advice.
<!-- source: docs/decisions/0027-menta-ai-buddy.md, backend/apps/assistant/service.py -->

## How do I find my way around the portal?

After you sign in, the left-hand menu (or the menu button on a phone) shows the screens for your role. Student screens: Overview, My placements, Library, Sessions, More, Profile, Settings. Mentor screens: Overview, Students, Log session, Training, Library, More, Settings. Staff roles have their own menus, described in the guide for that role.
<!-- source: apps/portal/src/features/workspaces/RoleWorkspaceFrame.tsx, apps/portal/src/features/programme-admin/ProgrammeAdminFrame.tsx -->
