# Nurse Manager Overview

**Status:** Approved for implementation
**Audience:** Nurse Manager / Ward In-charge
**Primary job:** Keep facility placement handoffs moving safely.

## First-login decision sequence

The first screen must help the Manager answer these questions in order:

1. Am I looking at the correct facility scope?
2. What needs my action now?
3. Is there capacity to admit the next placement?
4. Are mentors and active placements progressing normally?
5. Where should I go next for the detailed operation?

The page is an operating console, not a generic analytics dashboard. The
attention queue is the primary surface; metrics and monitoring provide context.

## Information hierarchy

1. **Context:** facility name, signed-in role, and current operating period.
2. **Attention:** placement handoffs with the affected student, current state,
   missing operational piece, and next responsible action.
3. **Capacity:** ward occupancy and available slots before allocation.
4. **Progress:** scoped placement pipeline and mentorship activity signals.
5. **Monitoring:** interruption patterns and authorised safeguarding review.

## Layout

- A compact navy context panel spans the content width and contains one clear
  heading plus links to Placements and Mentors.
- The attention queue and capacity panel form the main two-column work area on
  desktop and stack in that order on mobile.
- A compact signal strip follows the main work area; it never replaces the
  queue.
- Interruption and safeguarding monitoring remain below operational work.
- The 375px layout uses full-width sections and stacked rows. The 768px layout
  uses two columns where content remains readable. The desktop layout caps the
  content measure instead of stretching panels to fill the viewport.

## Data and permission rules

- Facility identity comes from the authenticated server scope/read model; no
  facility switcher is shown.
- Placement actions are links into the scoped placement detail. The detail
  renders commands from server capabilities and transitions.
- Ward capacity is informational here; allocation remains a placement-detail
  command with a locked capacity check.
- Safeguarding list content stays narrative-free until an authorised review
  surface is opened.
- Dashboard request failures remain local to their region and never render a
  false zero or healthy empty state.

## State contract

Every region supports loading, success, empty, error with retry, and disabled
refresh behavior. Refresh must not duplicate requests. Existing React Query
queries remain the source of server state and are not replaced with local
copies.

## Visual direction

- **Inherited:** navy/teal/mist palette, Manrope/Inter type tokens, Lucide icons,
  rounded operational surfaces, and the fixed responsive workspace shell.
- **Adapted:** reduce the oversized hero treatment and move the first useful
  decision above the metric strip; use thin borders and restrained elevation.
- **Proposed:** attention rows use a small action cue and a plain-language
  “next step” label rather than colour-only status or decorative charts.
