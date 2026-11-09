# Programme Admin — Placement product contract and redesign plan

**Status:** UX/product contract draft
**Stage:** UX
**Audience:** Programme Administrator
**Related:** [Placement Management analysis](../../architecture/placement-management-analysis.md), [Placement access and setup](30-placement-access-and-setup.md), [Programme Admin placement design](36-programme-admin-placements-design.md)

## 1. Product context

MentorMAMA exists to make clinical placement mentorship safer and more
consistent for midwifery students. A placement connects one student to one
cohort, institution, facility, ward, and active mentor for a controlled period.
The Programme Admin is the programme-wide governance and continuity operator.
They keep the system configured, access trustworthy, and placement handoffs
visible. They are not a substitute mentor, student, coordinator, or nurse
manager.

The admin placement workspace therefore needs to show operational truth and
next decisions without turning protected clinical or student workflow data
into a general-purpose superuser screen.

## 2. Correct listing grain

The primary list is **one row per placement**. Since the placement invariant
allows one active student assignment per placement, each row represents one
student’s placement journey. A cohort may contain many rows and should be
available as a filter and grouping context, not as the row itself.

### Why not one row per cohort?

- A cohort does not have one lifecycle state; its students may be draft,
  active, paused, or completed at the same time.
- Ward capacity, mentor assignment, confirmation, induction, sessions, and
  completion blockers belong to an individual placement.
- A cohort row would hide the exact student requiring a decision.
- Programme-level monitoring can still group placement rows by cohort,
  institution, facility, ward, state, and date range.

The default view is a searchable, paginated placement register. A future
“Group by cohort” view may change presentation only; it must preserve the
placement row as the actionable unit.

## 3. Programme Admin authority

### Read access

The admin may see all placements inside the programme scope, including:

- student display identity required to distinguish the placement;
- cohort and institution context;
- facility and ward assignment;
- current mentor assignment;
- planned and effective dates;
- server-owned lifecycle state;
- safe assignment/lifecycle history and audit metadata;
- counts and safe status metadata for open safeguarding concerns;
- assessment milestone status, without student responses or scores by default;
- induction milestone status, signer, and completion time, without unnecessary
  checklist narrative by default;
- mentorship activity counts and latest activity date, without session free
  text by default.

### Controlled actions

The admin may perform these only when the capability matrix and transitions
endpoint allow them:

| Area | Action | UX requirement |
|---|---|---|
| Setup | Create placement | Cohort → enrolled student → dates → review; institution is derived |
| Setup | Allocate ward | Show capacity/context; require confirmation |
| Setup | Assign/reassign mentor | Show facility/mentor context; reassignment requires reason |
| Handoff | Release to student | Show that the student is the next actor |
| Lifecycle | Pause/resume | Controlled reason; explain changed effective end |
| Lifecycle | Complete | Show blockers and required upstream work first |
| Lifecycle | Withdraw | Controlled reason and consequence confirmation |
| Lifecycle | Archive | Admin-only, completed records only, audited confirmation |
| Governance | Review safe audit/activity | Immutable evidence; no editing or deletion |

The interface must consume the server transition response. It must not infer
that an action is valid from the visible state label alone.

### Explicit boundaries

The admin cannot log a mentor session, sign mentor induction, confirm a
placement as the student, edit submitted feedback, bypass capacity or
completion blockers, or impersonate another role. Sensitive safeguarding
narratives, confidential feedback comments, assessment responses/scores, and
free-text mentorship content need an explicitly approved read contract before
appearing in the admin detail view.

## 4. Placement detail information architecture

The detail view should be a decision workspace with a stable order:

```text
Placement header
  student · cohort · institution · state · planned/effective dates

Next action / blocked decision
  one prominent server-authorised action or actionable blocker list

Placement context
  student, cohort, facility, ward, mentor, dates, assignment status

Progress evidence
  confirmation/orientation · induction · mentorship · assessment
  milestone status and safe counts/dates only

Operational history
  assignment changes, lifecycle changes, pauses, invitations, audit events

Safeguarding signal
  open concern count/severity and authorised review entry point

Actions
  capability-gated commands; consequential actions require reason/confirmation
```

The student block should contain only the identity fields needed for safe
placement administration: name, email, and registration number where the
existing contract provides it. Course, date of birth, emergency contact, and
demographic data are not placement-admin defaults.

## 5. Data contract gaps to resolve before implementation

The current placement API provides placement summary, current student/mentor/
ward projections, transitions, and placement-scoped audit activity. The
following admin-safe read models are needed for the full detail design:

1. **Progress summary:** orientation acknowledged, induction opened/completed,
   mentorship session count/latest date, baseline/final assessment milestones.
   The existing composed progress endpoint now supplies the safe induction,
   mentorship, assessment, and safeguarding-count signals used by the admin
   detail. Orientation acknowledgement remains a separate explicit milestone
   gap.
2. **Safeguarding signal:** open count and severity metadata scoped to the
   placement, with a separate authorised detail route if policy permits.
3. **Assignment history:** student, ward, and mentor intervals with actor,
   timestamps, and safe end reasons.
4. **Completion readiness:** stable blocker codes/messages already exposed by
   transitions, plus enough context to link the user to the responsible next
   workflow.
5. **Placement list facets:** server pagination plus state, cohort,
   institution, facility, ward, mentor, and date filters as the dataset grows.

These should be additive read contracts owned by the relevant domains or a
placement-facing composition endpoint. The frontend must not query sibling
models or reconstruct progress from unrelated screens.

## 6. UX states

The list and detail must define:

- loading without a blocking session-style modal;
- true empty programme state with the correct create guidance;
- filtered no-match state with clear-filter action;
- API error with retry and preserved query/detail context;
- not-found/scope miss without data disclosure;
- blocked transition with reason and responsible next actor;
- successful command with persistent inline confirmation;
- idempotent replay with “already completed” language;
- uncertain/offline state only for workflows that actually support offline
  reconciliation.

## 7. Implementation sequence

### Phase 1 — role separation and register (implemented direction)

Keep Programme Admin, Coordinator, Nurse Manager, Mentor, and Student shells
separate. Use one placement row per student placement, state/search filters,
responsive register rows, and existing summary/detail/transition contracts.

### Phase 2 — admin decision detail

Implement the placement header, next-action/blocker surface, assignment
context, safe history, and responsive action rail using the existing APIs.

### Phase 3 — composed progress evidence (partially implemented)

Use the existing composed progress contract for safe milestone evidence in the
admin detail, with a clear boundary between counts/statuses and restricted
narratives. Assignment-history refinement, orientation acknowledgement,
additional safeguarding severity metadata, and richer completion-readiness
links remain additive follow-up contracts subject to privacy review.

### Phase 4 — monitoring and scale

Add server-side facets, cohort grouping presentation, saved filters, and
programme monitoring only after list performance and data ownership are clear.

## 8. Design direction

Use a formal operations register: white space, navy authority, teal action,
quiet rules, restrained status treatments, and strong typography. Tables are
for comparison; detail sections are for decisions; a small number of summary
signals are acceptable when they reduce scanning effort. Avoid decorative
hero art, dense card grids, fake completeness indicators, and disabled action
clusters that imply authority the server has not granted.
