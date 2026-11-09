# Nurse Manager — Ward operations

**Status:** Implemented for the facility-scoped operational slice

## Purpose

The Ward Operations screen is the Nurse Manager's facility view of ward
readiness. It supports daily placement decisions without becoming a programme
configuration screen.

## Manager responsibilities

- See only wards belonging to the Manager's assigned facility.
- Review maximum capacity, allocated students, and available slots.
- See the placement context currently visible for each ward.
- Open the placement register from a selected ward to allocate or change a
  placement's ward and mentor through the placement command workflow.
- Refresh stale operational data before making an allocation decision.

## Explicit boundary

Programme Administrators configure the ward catalogue: create, edit, and
archive wards. Nurse Managers do not change ward names, capacity limits, or
facility ownership from this screen. Capacity is a hard domain constraint and
is enforced again under a row lock by the placement allocation command.

## Layout and states

1. Page context: facility scope, operational purpose, and refresh action.
2. Ward cards: ward identity, shift pattern, occupancy bar, available slots,
   allocated count, visible placement count, and “Open placement register”.
3. Loading state: card-shaped skeletons preserving the final grid.
4. Error state: clear retry action without presenting an empty catalogue.
5. Empty state: explains that ward configuration belongs to the Programme
   Administrator.
6. Mobile: the table keeps comparison columns in a horizontally scrollable region; row actions remain keyboard accessible and are never clipped.

The ward action deep-links to `/placements?ward=<id>`. The placement register
initializes its ward filter from the URL and retains facility scope and server
capability checks.
