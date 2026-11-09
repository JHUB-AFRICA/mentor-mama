# Programme Admin — Placements workspace

**Status:** Implemented design direction
**Audience:** Programme Administrator
**Related:** [Programme Admin workspace skeleton](34-programme-admin-workspace-skeleton.md)

## Role and responsibility

Programme Admin sees the programme-wide placement register and is responsible
for governed operational handoffs. The page helps answer: **which placements
need a decision, and what is the next permitted handoff?**

The server remains authoritative for every capability and lifecycle transition.
The interface must not imply that Programme Admin performs student, mentor, or
clinical work on behalf of those roles.

### Permitted actions

- Create a placement from an eligible cohort and enrolled student.
- Allocate a ward when the placement state and ward capacity permit it.
- Assign or reassign a mentor through the approved action path.
- Release a scheduled placement to the student for confirmation.
- Pause, resume, complete, withdraw, or archive only when the transition API
  exposes the action and the current state permits it.
- Inspect safe placement activity, blockers, assignments, and lifecycle dates.

### Explicitly unavailable

The page does not offer controls for logging mentorship sessions, signing an
induction, confirming a placement as the student, editing submitted feedback,
or bypassing blockers/capacity. Actions unavailable from the server response
should be represented as a clear state, not as disabled control clutter.

## Workspace structure

The Programme Admin placement route remains inside the Programme Admin frame.
It must keep the admin rail, header, notification inbox, account menu, and
active Placements navigation state. Coordinator and Nurse Manager placement
routes continue to use their own role workspace frame; student and mentor
routes continue to use their personal placement workspace.

```text
Programme Admin header: Placements

Operational register                                  New placement
See where each student is in the lifecycle and resolve the next handoff.

Search cohort or facility                         State

Student / cohort | Facility | Ward | Status | Dates
------------------------------------------------------
Placement row
Placement row

Mobile: stacked labelled placement rows
```

Rows are for comparison and selection, not cards. The detail view is a
contextual operational surface with setup/ownership, activity, snapshot, and
state-driven next action sections.

## Filters and states

- Search covers cohort and facility, using the existing API query contract.
- State filter covers draft, scheduled, awaiting student, active, paused,
  completed, withdrawn, and archived.
- The list has a loading state, an error/retry path, a true empty state, and a
  no-match state that explains how to clear the current query.
- Desktop uses a dense table-like register. Narrow screens use stacked rows
  with student/cohort, facility, ward, mentor, status, and dates retained.
- The create action is visible only when `create_placement` is granted.

## Detail surface

The detail surface keeps the user in the same role-owned frame. It presents
the student/cohort context first, then assignment setup, activity evidence,
placement snapshot, and the next permitted action. Blocked transitions show
their safe reason text from the transitions endpoint. Pause and withdrawal
require a reason and confirmation; archive remains a Programme Admin-only
capability.

## Interaction rules

- Do not switch to a generic sidebar when entering or leaving placement detail.
- Back returns to the register without changing role context.
- All dialogs close by explicit cancel, backdrop click where safe, or Escape.
- Actions show busy state and preserve the selected placement after refresh.
- Empty states explain the next useful action without inventing operational
  data.
