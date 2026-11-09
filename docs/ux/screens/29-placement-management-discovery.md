# Placement Management — UX discovery and screen plan

**Status:** Discovery complete; core Placement Management UI implemented

## Product feel

Placement Management should feel like a calm operations board, not an
administrative database. The hierarchy is:

1. What needs attention now?
2. Which student/placement is affected?
3. What is the next permitted action?
4. Why is an action blocked, and what can this role do about it?

Use the existing MentorMAMA system: navy for authority and navigation, teal for
progress/actions, mist surfaces for context, amber for pending/attention, and
red only for destructive or blocking states. Cards summarize; tables handle
scanning and bulk work; drawers/details handle one placement at a time.

## Screen map

### 1. Placements overview

Role-aware heading, filter bar, and compact summary strip:

- All placements in scope
- Awaiting action
- Active
- Paused
- Completion blocked

Desktop uses a table with columns Student, Institution/Facility, Ward, Mentor,
Dates, State, and Next action. Mobile changes each row into a stacked placement
card with the state and next action first. Loading uses table/card skeletons;
empty states explain how to create or await placements; API failures offer retry.

### 2. Create placement

A focused multi-step drawer or page:

1. Select cohort and enrolled student.
2. Review institution derived from the cohort.
3. Select planned dates within the cohort rules.
4. Review a plain-language summary before creating.

The client never selects institution authority independently. Date errors should
appear next to the date fields; duplicate/overlap and authorization errors should
appear in a form-level alert.

### 3. Placement detail

The detail view is the shared operational surface. Its top section shows student
identity-safe display data, state, dates, and one prominent server-provided next
action. The body contains:

- lifecycle stepper from Draft to Archive;
- assignment cards for student, ward, and mentor;
- placement timeline/audit events;
- blockers and required tasks;
- role-specific command actions.

Use a right-side action rail on desktop and a sticky bottom action bar on mobile.
Destructive transitions use a confirmation modal with a required reason. Blocked
completion shows reasons as actionable checklist items, never a dead button.

### 4. Ward allocation and mentor assignment

Use a two-column selection surface: candidate list on the left, selected ward or
mentor summary on the right. Capacity must be visible before submission. An
assignment success state should say what changed and identify the next actor,
for example: “Ward allocated. The Nurse Manager can now assign a mentor.”

### 5. Student confirmation/orientation

Keep this deliberately narrow. The student sees the placement summary, facility,
ward, dates, assigned mentor when available, and a clear Confirm / Need help
choice. After confirmation, the next state is Orientation with a single next
action—not a dashboard full of unrelated data.

### 6. Mentor Today

The mentor sees only assigned placements. Prioritize the next session action,
induction status, paused/blocked reasons, and queued/unsynced work. Session entry
must be short and optimized for a ward-floor device; the no-patient-identifiers
instruction is adjacent to free text rather than hidden in help content.

## Required UX states

Every placement screen must define loading, empty, error, unauthorized/not-found,
blocked transition, successful command, duplicate replay, and offline/uncertain
submission states. Toasts may confirm background success, but security or data
loss risks must also have persistent inline messaging.

## Navigation recommendation

Use the role-aware `/placements` route in the portal shell. The current SPA keeps
the selected placement detail inside that workspace, while the API and service
boundaries remain placement-ID based. Add a `/placements/:placementId` deep link
when refresh-safe detail navigation is required. Expose only actions returned by
the transitions endpoint. Programme Admin, Coordinator, and Nurse Manager
operate the management screens; Student and Mentor receive focused “My placement”
and “Today” experiences rather than the full operations table.

## Design guardrails

- Avoid giant hero headings on operational screens; reserve visual emphasis for
  state and next action.
- Keep table rows dense enough to scan but preserve generous touch targets.
- Do not use color alone for state; pair state color with text and icon.
- Do not show patient identifiers or invite data in placement views.
- Do not expose another institution/facility through filters, counts, or empty
  search results.
