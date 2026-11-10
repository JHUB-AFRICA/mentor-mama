# ADR 0028 — Placement allocation: who decides what, and what is automatic

**Status:** Accepted for the pilot (2026-11-11) · **Owners:** Product, Placements
**Related:** `architecture/placement-management-analysis.md`, POL-005/006/007, INV-16/17, WFR-002

## Problem

Placement creation, ward allocation and mentor assignment were described as a
hand-off between the coordinator and the nurse manager, but the implementation had
three gaps:

1. A draft placement has no facility, and a nurse manager only saw placements that
   already belonged to their facility. A nurse manager therefore **could not find**
   the students they were supposed to place; only the Programme Admin could.
2. Every student needed a ward and a mentor chosen one at a time.
3. Nobody could say which hospital a student was meant to go to before a ward was
   chosen, so coordinators had no way to express a partner-facility plan.

## Decision

Keep each role's authority exactly where the authority matrix already puts it, and
add two small, explainable steps that remove the one-by-one work.

| Step                       | Who                    | What happens                                                                                                                          | Automatic?                                    |
| -------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1. Create placements       | University Coordinator | Creates draft placements for enrolled students of a cohort and a date window                                                          | Bulk, already                                 |
| 2. **Request facilities**  | University Coordinator | Chooses the partner facilities for those drafts: one facility, or several with **Split by declared capacity** (or an even split)      | Split is automatic, previewed, then confirmed |
| 3. Incoming queue          | Nurse Manager          | Sees the students requested of _their_ facility, and only theirs                                                                      | Notified by email                             |
| 4. **Arrange students**    | Nurse Manager          | One button: students are placed into the wards they set up and spread across mentors who are accepting and under their workload limit | Automatic, previewed, then confirmed          |
| 5. Schedule                | System                 | When student + ward + mentor are all set the placement becomes _Scheduled_ (WFR-002)                                                  | Automatic                                     |
| 6. Release                 | University Coordinator | Releases scheduled placements to students                                                                                             | Manual by design                              |
| 7. Confirm, orient, induct | Student, Mentor        | Existing journey                                                                                                                      | —                                             |

Programme Admin can do any step as a controlled fallback. Nobody can press another
institution's button: a coordinator never allocates wards and a nurse manager never
releases to students.

### Why a _request_, not a direct allocation

`requested_facility` is only an ask. The placement's facility is still derived from
the ward the facility itself allocates (INV-17), so the facility keeps the final say
on capacity and a coordinator can never overfill a hospital. A facility with no
declared ward capacity is never sent more students than it declared when the
capacity split is used.

## How the automatic steps work

**Split by capacity (coordinator).** Free capacity of each chosen facility is the
sum over its wards of `max_students` minus the students already holding a place on
that ward at any time in the placement window. Students are shuffled with a stored
seed, then divided by largest-remainder in proportion to free capacity, never above
it. Students who do not fit are listed as _unplaced_ rather than forced.

**Arrange (nurse manager).** For each requested student, in seeded random order:

1. choose a ward with space over the student's own dates — _balanced_ (emptiest
   share of capacity first, default) or _fill_ (first ward until full);
2. choose the mentor with the most remaining capacity, preferring mentors who have
   completed required training; mentors who are not accepting students or are at
   their limit are never chosen;
3. run the normal `allocate_ward` and `assign_mentor` commands, so capacity locks,
   audit rows and events are exactly the same as manual placing.

Each student is processed in its own transaction: one failure never leaves a
student half-arranged and never blocks the rest. The seed is returned by the
preview and reused by Apply, so what was reviewed is what runs. Every run is
stored (`AllocationRun`) with its strategy, seed and counts.

## Notifications

One message per recipient instead of one per student:

- nurse manager(s) of the facility — _students are waiting_ (after step 2);
- each mentor — _new students have been assigned to you_ with the count (step 4);
- coordinators of the institution — _students have been arranged_ (step 4);
- students are emailed by the existing invitation when the coordinator releases.

Per-placement "scheduled" and "mentor assigned" emails are suppressed inside a
batch only. Manual assignment still sends them, and the manual mentor email now
actually reaches the mentor (the event previously carried no recipient).

## Alternatives considered

- **Fully manual (status quo):** correct but slow, and the nurse manager could not
  see unplaced students.
- **Coordinator allocates wards directly:** breaks the authority split and ignores
  the capacity the facility owns.
- **Programme-wide auto-placement with no facility step:** hides who is responsible
  when a hospital cannot take a student; also removes the chance for a coordinator
  to honour a rotation agreement. The hybrid keeps rotations manual-by-choice and
  capacity-driven when the coordinator wants it.

## Open points for the programme team

- Whether a coordinator may _re_-request a student whose facility declined (today a
  request can be changed while the placement is still a draft with no ward).
- Whether mentors should be matched to a ward rather than to the facility (the data
  model has no ward-to-mentor link; wards are not staffed in MentorMAMA).
- Rotation rules (several wards in one placement) are not modelled; one ward per
  placement remains the invariant.
