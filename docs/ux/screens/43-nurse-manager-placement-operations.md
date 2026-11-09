# Nurse Manager placement operations

## Purpose

The placement workspace is the Nurse Manager's operational queue for students
already assigned to the manager's facility. It answers three questions quickly:

1. How many placement records are in this facility scope?
2. Which handoffs need a facility decision next?
3. Which ward or mentor context is missing?

Programme-level creation, release, cohort planning, and configuration remain
outside this workspace. The Manager can open a placement and use only the
capability-gated operational commands available to their role, including ward
allocation, mentor assignment, lifecycle review, and placement history.

## Navigation

- `/placements` is the dedicated Manager placement queue.
- `/placements/:id` opens the existing scoped placement detail and operational
  command surface.
- `/facility/wards?` links into the queue with a `ward` filter, preserving the
  Manager's capacity-to-handoff workflow.

## Interface structure

- Page header: facility-scoped title, purpose, and refresh action.
- Summary cards: records in scope, handoffs needing a decision, and assigned
  mentors.
- Operating queue: search by student or mentor and filter by handoff state,
  ward, or mentor.
- Handoff rows: student, cohort, ward, next operational action, mentor state,
  and a clear route into detail.
- Explicit empty and retry states; filters are URL-backed so views are
  shareable and browser navigation remains reliable.

## Scope and data rules

The server remains authoritative for facility scope. The frontend does not
infer or widen the Manager's access from filter values. Placement options and
placement records are both resolved through the authenticated user's scope.
