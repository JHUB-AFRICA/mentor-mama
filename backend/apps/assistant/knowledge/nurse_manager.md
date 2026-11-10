# Nurse Manager guide

## What screens do nurse managers have?

The Nurse Manager menu has two groups. Operate: Overview, Placements, Mentors, Ward operations. Review: Safeguarding, Reports, Activity. Account & security is in the account menu at the top right (with Notifications and Sign out). You work within your own facility only.
<!-- source: apps/portal/src/features/nurse-manager/FacilityWorkspaceFrame.tsx -->

## What can a nurse manager do?

Within your facility you can assign and reassign mentors and wards, open induction as an override, pause, resume, withdraw and complete placements, review and resolve safeguarding concerns, monitor induction and sessions, and export facility reports.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, backend/apps/identity/capabilities.py -->

## What can a nurse manager NOT do?

You cannot see another facility's placements, change cohort membership, act on university-owned records, create or edit wards and facilities (the Programme Administrator owns the directory), log sessions, or release a placement to the student (coordinators do that). You cannot archive a placement either; only a programme administrator can.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, docs/product/requirements.md, backend/apps/identity/capabilities.py -->

## How do I assign a ward and a mentor to a placement?

Go to Placements, open the placement, and set the ward and the mentor (the mentor section has a "Save mentor" action). When a student, a ward and a mentor are all assigned, a Draft placement becomes Scheduled automatically. A ward that is full cannot be chosen, and a placement can have only one active mentor.
<!-- source: apps/portal/src/features/nurse-manager/NurseManagerPlacementDetail.tsx, backend/apps/placements/services.py -->

## How do I reassign a mentor?

Open the placement under Placements and choose a different mentor. The old assignment is closed and a new one opens; history is kept, and the mentor and student are notified. Sessions already logged stay with the original mentor.
<!-- source: backend/apps/placements/services.py, docs/architecture/stage3-business-rules-and-invariants.md -->

## Where do I see my mentors?

Open Mentors ("Mentor operations") to see the mentors in your facility, then open one to see their current placement workload, recent activity, availability and capacity, invitation status and allocation rules. Mentor records belong to the hospital side, so the university side cannot see them.
<!-- source: apps/portal/src/features/nurse-manager/NurseManagerMentorOperations.tsx, docs/architecture/stage3-business-rules-and-invariants.md -->

## What is Ward operations for?

Ward operations is where you manage day-to-day ward use for your facility's placements. Ward settings such as maximum students are edited by the Programme Administrator in Programme setup, not by nurse managers.
<!-- source: apps/portal/src/features/nurse-manager/NurseManagerWardOperations.tsx, docs/product/requirements.md -->

## How does ward capacity affect me?

Placements in Orientation, Induction, Active or Paused count towards a ward's maximum. If a ward is full, assigning another placement fails with "This ward is at capacity." Pick another ward or ask the Programme Administrator whether capacity can change.
<!-- source: backend/apps/core/errors.py, docs/architecture/stage3-business-rules-and-invariants.md -->

## How do I open induction for a student?

Normally the assigned mentor opens induction once the student has acknowledged orientation. As a nurse manager you can open induction as a recorded override when orientation is not yet acknowledged, with a written reason. Signing the induction itself is done by the mentor.
<!-- source: backend/apps/placements/services.py, docs/architecture/stage3-business-rules-and-invariants.md -->

## How do I pause or resume a placement?

Open the placement under Placements. For an Active placement choose the pause action and pick a reason from the list (for example student illness, industrial action or facility closure). A paused placement shows the resume action. Resuming extends the actual end date by the paused days.
<!-- source: apps/portal/src/features/placements/PlacementManagement.tsx, backend/apps/placements/services.py -->

## How do I withdraw a placement?

Open the placement and choose withdraw, then give a reason from the list: student withdrew, academic decision, facility capacity, safeguarding, administrative error or other. Withdrawal is permanent and the record stays for reporting.
<!-- source: backend/apps/placements/services.py, docs/architecture/stage3-business-rules-and-invariants.md -->

## How do I complete a placement?

You can complete an Active placement once the student has submitted the final assessment and no safeguarding concern is still open. If either is missing, you see "The final assessment has not been submitted." or "This placement cannot be completed while a concern is still open."
<!-- source: backend/apps/placements/services.py, backend/apps/core/errors.py -->

## How do I review a safeguarding concern?

Open Safeguarding and choose a concern. Open concerns show "Assign to me". Once under review, record a finding with "Record finding", then record the action taken with an outcome (internal action, referred externally, no action required) and choose "Resolve with action". A resolved concern can be closed with "Close concern". Closed concerns cannot be reopened.
<!-- source: apps/portal/src/features/safeguarding/SafeguardingReviewPanel.tsx, docs/architecture/stage3-business-rules-and-invariants.md -->

## Who can read the text of a safeguarding concern?

Only the person who raised it, the assigned reviewer and a programme administrator can read the description and action text. Lists, dashboards, exports and notifications show only counts, categories and severity. Every time a description is opened, it is logged.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, backend/apps/safeguarding/services.py -->

## Can I review a concern about myself?

No. The subject of a concern cannot be its reviewer.
<!-- source: backend/apps/core/errors.py -->

## What do the Reports and Activity screens show?

Reports shows facility-level counts and trends and lets you request an export of placement records (CSV, Excel, JSON or PDF). Exports contain counts and flags, not notes or concern text. Activity shows a timeline of recent actions in your facility.
<!-- source: apps/portal/src/features/nurse-manager/NurseManagerReports.tsx, backend/apps/analytics/export_service.py -->

## What feedback can I see?

Nurse managers can read confidential feedback attached to placements in their facility. Every read is logged. Anonymous feedback only appears as grouped ratings per ward, and only when at least three students have responded.
<!-- source: docs/architecture/stage3-business-rules-and-invariants.md, docs/verification/anonymous-feedback-implementation-2026-11-09.md -->

## What happens next when I assign the last missing item?

The placement becomes Scheduled and the coordinator is notified. The coordinator then releases it to the student, as long as the mentor has finished any required training.
<!-- source: backend/apps/placements/services.py -->
