# Coordinator cohort management

## Scope

University Coordinators create cohorts and enrol students belonging to their own institution. This slice does not create placements or assign facilities; those are separate placement workflows.

## Flow

1. Coordinator creates a cohort name, start date, end date, and optional planned capacity.
2. The API derives the institution from the authenticated Coordinator.
3. Coordinator selects an institution student and adds them to the cohort.
4. The API verifies the cohort and student share the Coordinator’s programme and institution.
5. The cohort member count updates after successful enrolment.
6. Coordinator may edit cohort details; date changes that cause a member to overlap another active cohort are rejected with a reviewable conflict.
7. Coordinator may archive a cohort. The cohort leaves active planning lists while its placements and audit history remain preserved.
8. For bulk enrolment, Coordinator selects up to 100 institution students, reviews eligible/already-enrolled/overlap/unavailable counts, then confirms. The server revalidates all selections before committing.
9. Cohort detail summarizes placements by lifecycle state and shows enrolled students who do not yet have a placement.
10. Membership removal requires a reason and writes a removal timestamp and actor; it does not delete the membership record or placement history.

## Rules

- Start date must be before end date.
- Planned capacity is advisory and does not block enrolment.
- Duplicate cohort memberships are idempotent and do not create duplicate rows.
- A student cannot be enrolled in two active cohorts whose date ranges overlap. Enrolment into a later non-overlapping cohort is allowed; previously completed cohort history remains intact.
- Suspended students remain visible for controlled administration; deactivated or cross-institution accounts do not.
- The Cohorts & Students roster hides deactivated students by default. The separate Manage Students view may show them only when the Coordinator explicitly selects the Deactivated status filter; those records remain institution-scoped and read-only for access recovery. Coordinators cannot reactivate them. Enrolment continues to reject deactivated accounts.
- Placement creation remains a separate placement-domain command.
- Capacity remains advisory during bulk enrolment.
- Removed memberships do not count as current roster members; re-enrolment creates a new active membership row.
- Archived cohorts cannot receive enrolments or placements; their historical records remain available through existing placement history.

## Workspace frame

The Coordinator and Nurse Manager surfaces use the shared operational shell:
a persistent dark navigation rail on desktop, a responsive off-canvas rail on
small screens, and a sticky white utility header containing scope, identity, and
notifications. The main content remains responsible for the role-specific
onboarding task, while Placements is a first-class sibling destination rather
than an inline afterthought.
