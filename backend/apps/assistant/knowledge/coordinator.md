# University Coordinator guide

## What screens do coordinators have?

The Coordinator menu has: Overview, Cohorts & students, Placements, Reports and Activity. Manage students and Invite students are screens you reach from Cohorts & students. Account & security is in the account menu at the top right (with Notifications and Sign out). You work within your own institution only.
<!-- source: apps/portal/src/features/coordinator/CoordinatorFrame.tsx, apps/portal/src/features/coordinator/CoordinatorWorkspace.tsx -->

## What can a coordinator do?

Within your institution you can invite students, manage cohorts and enrolment, create placements, release them to students, pause, resume or withdraw placements, monitor progress, read approved feedback, review high-severity safeguarding concerns from your institution, and view reports and exports.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, backend/apps/identity/capabilities.py -->

## What can a coordinator NOT do?

You cannot see another institution's data, assign wards or mentors (nurse managers do that), complete an induction, log a session, read mentor staff records, or read the free text of mentorship sessions (you see only date, type, topics and duration). You cannot archive placements or edit the programme directory.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, docs/verification/coordinator-verification-2026-11-09.md, backend/apps/identity/capabilities.py -->

## How do I invite one student?

Go to Cohorts & students, then choose Invite students. Use the single-student option ("Invite one student securely"), enter the student's details and choose "Send invitation". The student gets an email link to set up their account. Invitations from here are for students at your own institution.
<!-- source: apps/portal/src/features/coordinator/CoordinatorStudentInvites.tsx, docs/architecture/authentication-and-account-lifecycle.md -->

## How do I invite many students at once?

Go to Cohorts & students, then Invite students, and choose the batch option ("Invite students in one reviewable batch"). Choose a CSV or Excel roster (.csv, .xlsx, .xls). Every row is checked and shown for review before anything is sent, so you can fix problems first.
<!-- source: apps/portal/src/features/coordinator/CoordinatorStudentInvites.tsx, docs/verification/coordinator-verification-2026-11-09.md -->

## How long does an invitation last?

An invitation link works for 48 hours and only the newest link works. If it expired, ask your Programme Administrator to resend it; a coordinator cannot resend it, and an account can be re-sent at most three times in 24 hours.
<!-- source: backend/apps/identity/authentication.py, backend/apps/core/errors.py -->

## How do I see and manage my students?

Go to Cohorts & students, then choose Manage students. You get a roster with search and a cohort filter. Deactivated students are hidden unless you choose the Deactivated filter. Use "View" on a row to open the student. Suspending a student account is allowed for your own institution's students; deactivating needs the Programme Administrator.
<!-- source: apps/portal/src/features/coordinator/CoordinatorStudentManagement.tsx, docs/architecture/authentication-and-account-lifecycle.md -->

## How do I create a cohort?

In Cohorts & students choose "Create cohort", give it a name, a start date and an end date (the end must be after the start) and an optional planned capacity. Planned capacity is a target and only warns if exceeded.
<!-- source: apps/portal/src/features/coordinator/CohortManagement.tsx, backend/apps/core/errors.py -->

## How do I add students to a cohort?

Students must already have accounts (invite new ones first with "Invite students"). Then open the cohort in Cohorts & students:

1. One student: pick the student and choose "Add student to cohort".
2. Several students: under "Add several students", select up to 100 students in the list, choose "Preview", check who is ready, already enrolled, overlapping or unavailable, then choose "Confirm eligible students".
   There is no CSV upload for enrolment; CSV upload is only for inviting new students. A student cannot be in two cohorts with overlapping dates.

<!-- source: apps/portal/src/features/coordinator/CohortManagement.tsx, backend/apps/institutions/services.py -->

## How do I remove a student from a cohort or archive a cohort?

Removing a student needs a reason, and the history and placement records are kept. Archiving a cohort is a soft archive that preserves cohort and placement history.
<!-- source: docs/product/requirements.md, docs/verification/coordinator-verification-2026-11-09.md -->

## How do I create a placement?

Go to Placements and choose "Create placement". Select a cohort, choose the student or students, and set the planned start and end dates (the start must be before the end). Students who already have an overlapping placement are skipped with a reason. New placements start as Draft.
<!-- source: apps/portal/src/features/coordinator/CoordinatorPlacementCreate.tsx, backend/apps/placements/services.py -->

## What happens after I create a placement?

The placement stays in Draft until a nurse manager assigns the ward and the mentor. Then it becomes Scheduled automatically and you are notified. You do not choose the ward or mentor yourself.
<!-- source: backend/apps/placements/services.py, backend/apps/identity/capabilities.py -->

## How do I release a placement to a student?

When a placement is Scheduled, open it and choose "Release placement". The student is told and the placement becomes Awaiting student. If the programme requires mentor training first and the assigned mentor has not finished it, you see "The assigned mentor has not completed required training."
<!-- source: apps/portal/src/features/placements/PlacementManagement.tsx, backend/apps/placements/services.py -->

## Can I pause, resume or withdraw a placement?

Yes. Pausing an Active placement and resuming it need a recorded reason (for pause) and extend the actual end date by the paused days. Withdrawing needs a reason from the list. You cannot complete or archive a placement.
<!-- source: backend/apps/identity/capabilities.py, backend/apps/placements/services.py -->

## What happens next after a student signs?

The placement moves to Orientation. The student completes orientation, then the mentor does induction and the placement becomes Active. You can follow all stages in Placements and the cohort page, which counts placements by stage.
<!-- source: docs/product/requirements.md, docs/verification/coordinator-verification-2026-11-09.md -->

## How do I get reports and exports?

Go to Reports. Choose your filters and "Request export" (CSV, Excel, JSON or PDF). The file appears under Export history when ready and the link lasts 15 minutes. Exports show your institution's placements with counts and flags only, never notes or feedback text.
<!-- source: apps/portal/src/features/coordinator/CoordinatorReports.tsx, backend/apps/analytics/export_service.py -->

## What feedback and safeguarding information do I see?

You can read confidential feedback linked to placements in your institution (each read is logged) and grouped anonymous ratings only when three or more students responded. For safeguarding you see counts and severity, and you may review high-severity concerns from your own institution.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, docs/verification/anonymous-feedback-implementation-2026-11-09.md -->
