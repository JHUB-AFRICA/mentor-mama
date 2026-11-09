# University Coordinator product contract

**Status:** UX foundation for coordinator page redesign

## Role in the operating model

The University Coordinator is the university-side operator for one institution.
They prepare students and placements, monitor progression across the hospital
handoff, review approved quality and safeguarding signals, and produce safe
institution reports. They do not operate the ward or perform another role's
workflow.

The Coordinator's scope is derived from the authenticated account. The client
must never allow an institution switcher or accept institution authority from a
form.

## Authority matrix

| Area | Coordinator may do | Coordinator may see | Boundary |
| --- | --- | --- | --- |
| Students | Invite students individually or in bulk, enrol them into cohorts, suspend a student where authorised | Institution student roster and safe profile/registration data | Cannot manage mentors, coordinators, or hospital staff |
| Cohorts | Create cohorts, set planning dates/capacity, enrol institution students | Cohort membership and counts | Planned capacity is advisory; it is not a placement blocker |
| Placements | Create a placement from an enrolled student, release a fully prepared placement to the student, pause/resume/withdraw where permitted | All placements in the institution, lifecycle, dates, assignments, progress metadata, session counts/latest date, safe blockers, safeguarding counts/severity | Nurse Manager allocates ward, assigns/reassigns mentor, and completes placement; no capacity bypass |
| Quality | Review approved feedback and institution-level indicators | Aggregates and authorised confidential feedback surfaces | Session free text, assessment responses/scores, and safeguarding narratives are restricted by default |
| Safeguarding | Review and participate in authorised escalation handling | Institution-scoped concern counts, severity, and authorised detail when the workflow permits | No casual narrative access; every review action is audited |
| Reporting | Request institution-scoped placement/cohort exports | Export status, applied filters, expiry, and safe operational indicators | No cross-institution data; exports are auditable and time-limited |
| Access | Maintain own profile, password, MFA, sessions, and notification preferences | Own account/security state | Programme Admin owns staff role/scope administration |

## Placement handoff

The cross-institution handoff is deliberately split:

1. Coordinator creates the student placement from an enrolled cohort.
2. Nurse Manager allocates a ward under facility capacity rules.
3. Nurse Manager assigns or reassigns the clinical mentor.
4. Coordinator releases the fully assigned placement to the student.
5. Student confirms and completes orientation.
6. Mentor/Nurse Manager operate induction and sessions.
7. Coordinator monitors progress and reviews authorised signals.

The older SADD wording that groups “create placement and allocate ward” under
the Coordinator is superseded by the current capability matrix, placement
service boundary, and invariant tests: ward allocation belongs to the Nurse
Manager, with Programme Admin as the controlled fallback.

## Required coordinator pages

### 1. Overview

An institution control room, not a collection of generic cards. It should show
the current operating context, attention queue, progression signals, upcoming
handoffs, open safeguarding counts/severity, interruption patterns, and direct
links to the next permitted action.

### 2. Cohorts & students

One page with tabs or clear sub-navigation for cohort planning and the student
roster. It supports search, cohort filtering, invitation status, enrolment, and
bulk student onboarding. Large rosters require server pagination, empty and
no-match states, retry states, and a student detail drawer rather than a long
unstructured list.

### 3. Placements

An institution-scoped operational register with one row per student placement.
Filters include cohort, lifecycle state, facility, ward, mentor, and attention
status. The detail view explains the next actor, progress, assignments, dates,
safe activity, blockers, and permitted Coordinator actions.

### 4. Reports

An institution evidence surface for indicators, interruptions, approved
feedback aggregates, and a bounded export queue. Every export shows scope,
filters, ownership, expiry, and failure/retry status.

### 5. Activity

An institution-scoped audit view for invitation, cohort, enrolment, placement,
release, lifecycle, safeguarding-review, and export actions. It exposes safe
change metadata, never secrets or restricted narratives.

### 6. Account & security

Personal security and profile settings: password, active sessions, MFA/recovery,
notification preferences, and contact details. This is account administration,
not programme configuration.

## Sidebar

**Coordinate**

- Overview
- Cohorts & students
- Placements

**Understand**

- Reports
- Activity

**Personal**

- Account & security
- Sign out

No Help or programme setup link is shown until a real support or configuration
workflow is owned by this role. No programme switcher is shown because the
pilot account belongs to one institution and one programme context.

## Explicit exclusions

The Coordinator cannot log mentorship sessions, complete mentor induction,
confirm a placement as the student, edit submitted feedback, allocate wards,
assign mentors, complete/archive placements, impersonate users, bypass blocked
transitions, or browse restricted narratives by default.

## Design sequence

The shell is complete. Page design should proceed in this order:

1. Overview attention and progression model
2. Cohorts & students roster and student detail
3. Placements register and placement detail
4. Reports governance and export states
5. Activity audit presentation
6. Account/security polish
