# Slice A — Placement Access and Setup

**Status:** Slice A implemented; lifecycle, participant, induction, and session UX are also in place
**Actors:** University Coordinator, Nurse Manager/Ward In-charge, Programme Admin
**Outcome:** A valid placement is created, allocated to a ward, and assigned to a mentor without crossing scope or capacity boundaries.

The implementation provides a scoped, server-paginated list and detail contract,
reference options from the owning institution/facility/identity boundaries, and
a responsive management workspace for Programme Admins, Coordinators, and Nurse
Managers. The detail view now consumes the server transition matrix and exposes
role/state-valid pause, resume, complete, and withdraw actions with reason
capture where required. It also includes a placement-scoped history timeline
showing the actor, role, timestamp, action, and override reason when present.

## 1. Ideal end-to-end flow

```text
Coordinator opens Placements
  → reviews scoped placement list
  → selects Create placement
  → selects cohort
  → selects an enrolled student
  → enters and reviews planned dates
  → confirms placement creation
  → placement appears as Draft

Nurse Manager opens the same placement in facility scope
  → reviews placement summary and required next action
  → selects an available ward
  → sees capacity and date/context before confirming
  → confirms ward allocation
  → placement moves to Draft or Scheduled according to server response
  → selects Assign mentor
  → selects an eligible facility mentor
  → confirms assignment
  → placement becomes Scheduled when the complete assignment set exists
```

The interface should always make the next useful action explicit. After each
successful command, show who owns the next step rather than leaving the user at
a generic success toast.

Examples:

- “Placement created. Allocate a ward to continue.”
- “Ward allocated. A Nurse Manager can now assign a mentor.”
- “Mentor assigned. The placement is ready for scheduling.”
- “All setup assignments are complete. The student can now confirm.”

## 2. Coordinator journey

### Placements list

The Coordinator sees only placements belonging to their institution. The list
supports state, cohort, date, facility, and student search/filtering when those
filters are available from the scoped API. The first release should prioritize:

- state filter;
- cohort filter;
- student/name search;
- clear empty state;
- clear retry state;
- pagination or bounded results rather than an unbounded list.

Primary action: **Create placement**.

### Create placement form

Use a focused page or large drawer with four intentional sections:

1. **Cohort** — select only cohorts inside the Coordinator’s institution.
2. **Student** — select only students enrolled in the selected cohort.
3. **Placement window** — enter planned start and end dates.
4. **Review** — show student, institution, cohort, dates, and the next setup step.

Institution is displayed as derived context and is never an editable authority
field. Facility and ward are not selected by the Coordinator in this slice;
those are assigned by the facility-side operator.

The submit action is disabled while loading or submitting. The command must send
an idempotency key. On success, navigate to the placement detail view and focus
the next action banner.

## 3. Nurse Manager journey

### Placement work queue

The Nurse Manager sees only placements in their facility. The list should lead
with placements needing facility action:

- Awaiting ward allocation;
- Awaiting mentor assignment;
- Scheduled;
- Active;
- Paused or blocked.

Each row/card shows student-safe display data, cohort, planned dates, current ward
and mentor, state, and the next permitted action returned by the API.

### Allocate ward

The Nurse Manager opens the placement detail and chooses **Allocate ward**. The
selection view lists only wards in the current facility and displays:

- ward name;
- maximum capacity;
- currently occupied count;
- remaining capacity;
- whether the placement dates conflict with the ward’s current load.

Capacity is advisory in the UI but authoritative in the backend. A race with
another allocation must return a clear capacity error and leave the placement
unchanged.

### Assign mentor

After ward allocation, the Nurse Manager chooses **Assign mentor**. The candidate
list contains only active mentors in the current facility. The review panel shows
the mentor, placement, ward, and dates before confirmation.

Reassignment is a separate destructive-sensitive action. It requires a reason,
shows the outgoing and incoming mentor, preserves assignment history, and does
not rewrite previous session ownership.

## 4. Shared placement detail

The detail view is the handoff surface for both roles.

### Header

- placement state badge with text and icon;
- student and cohort context;
- planned and effective dates;
- one prominent **Next useful action** panel;
- secondary command menu for permitted transitions.

### Assignment section

Three cards show Student, Ward, and Mentor. Each card includes current value,
scope, assignment status, and history affordance. Empty assignments show the
responsible role rather than appearing broken.

### Timeline

Show created, ward allocated, mentor assigned/reassigned, scheduled, paused,
resumed, and state transitions. Sensitive free text is not included in this
summary list.

### Blockers

Completion or activation blockers appear as an explicit list with a reason and
next owner. A blocked button must never be the only explanation.

## 5. Constraints and failure cases

| Situation | Expected behavior |
| --- | --- |
| Student is not enrolled in cohort | Creation rejected; show student/cohort correction message |
| Cohort belongs to another institution | Do not expose it in list; direct access returns safe not-found |
| Planned dates are invalid | Inline date error; no command sent |
| Student has overlapping placement | Form-level domain error; existing data unchanged |
| Ward belongs to another facility | Ward absent from candidates; direct command rejected safely |
| Ward capacity is full | Show occupied/capacity counts and explain no allocation occurred |
| Capacity fills during submission | Return capacity error; refresh placement and ward availability |
| Mentor is inactive or outside facility | Candidate excluded; command rejected if stale UI submits |
| Assignment already exists | Return idempotent/replay-safe result or explicit conflict, never duplicate history |
| User loses connection after submit | Show uncertain/queued state and reconcile by command status; never blindly resend |
| User lacks permission | Hide action and enforce server-side authorization; no scope leakage |
| Placement is terminal | Detail is read-only except permitted archive/history actions |
| API returns 5xx | Persistent inline error with retry; preserve form inputs |

## 6. Loading and feedback states

- List: table skeleton on desktop, stacked card skeleton on mobile.
- Form reference data: field-level skeletons and disabled submit.
- Command submission: button-level “Saving…” plus a non-blocking progress state.
- Success: persistent inline confirmation in the detail view; optional toast.
- Validation: field-level messages for dates/selections and form-level domain alert.
- Authorization/not-found: neutral “This placement is unavailable” screen.
- Conflict/capacity: actionable error that offers refresh.
- Replay: “Already completed” confirmation with the returned current placement.

## 7. Backend contract required by this slice

- Scoped, paginated placement list with stable filters.
- Placement detail with active assignments and safe timeline data.
- Cohort and enrolled-student reference queries for the Coordinator.
- Facility ward availability query for the Nurse Manager.
- Active facility mentor query for assignment.
- Create placement command with idempotency metadata.
- Allocate ward command with row/ward locking and capacity validation.
- Assign/reassign mentor commands with history and reason handling.
- Transitions/next-action response consumed by the client.
- Stable domain error codes and retryability metadata.

## 8. Acceptance tests for Slice A and regression coverage

1. Coordinator creates a valid placement for an enrolled student in their own institution.
2. Coordinator cannot create a placement for an unenrolled or cross-institution student.
3. Nurse Manager sees only facility-scoped placements and wards.
4. Full ward capacity rejects allocation without changing the placement.
5. Concurrent allocation cannot exceed ward capacity.
6. Nurse Manager assigns an active facility mentor and assignment history is retained.
7. Reassignment requires a reason and preserves the outgoing mentor’s history.
8. Completing the assignment set causes the documented server-owned scheduling transition.
9. Duplicate command submission produces one placement/assignment and a replay result.
10. Lost-response/retry behavior leaves a visible, reconcilable command state.
11. Every loading, empty, validation, permission, conflict, error, and success state is visible in the browser.
