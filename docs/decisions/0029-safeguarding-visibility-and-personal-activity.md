# ADR 0029 — Safeguarding visibility and personal activity

Status: accepted (2026-11-11). Open for programme-governance review.

## Safeguarding concerns: who sees what

| Person                                                    | Sees in the queue                    | Can read the report                     | Can act                              |
| --------------------------------------------------------- | ------------------------------------ | --------------------------------------- | ------------------------------------ |
| Student / mentor who raised it                            | Own concerns                         | Own text and the status                 | Raise, follow status                 |
| Nurse manager (concern at their facility)                 | Category, severity, status, reviewer | Only after taking the concern (audited) | Take, record finding, resolve, close |
| Coordinator (concern on a placement in their institution) | Same metadata                        | Only after taking the concern (audited) | Same                                 |
| Programme admin                                           | Programme-wide metadata              | Yes (oversight, audited)                | Reassign, review                     |
| Anyone else                                               | Nothing                              | No                                      | No                                   |

Rules:

1. **Need to know.** The report is released to one reviewer at a time. Listing a concern never exposes narrative.
2. **Take, don't browse.** An in-scope person who is not the reviewer opens a summary with a "Take this concern" action; the earlier build returned an error here, which is why nurse managers saw "We couldn't load this page".
3. **No silent takeover.** A concern held by one reviewer cannot be taken by another reviewer; only a programme admin may reassign.
4. The raiser can never review their own concern.
5. High-severity concerns notify the facility's nurse managers and the institution's coordinators; others notify nurse managers only.

Open: whether the coordinator or nurse manager should be the default reviewer when the concern is about the other party (conflict of interest) — currently resolved by the admin reassigning.

## Activity is personal

Every Activity page (student, mentor, nurse manager, coordinator, programme admin) shows only activity linked to the signed-in person: what they did, and what happened to their placements or account. It is not a programme audit view; the audit trail itself stays in the database and is not exposed.

Entries are rendered as plain sentences ("Mentor assigned", "You logged a session") with the people and place involved. Action codes, transition ids, identifiers and raw change payloads are never returned. Safeguarding and feedback entries are visible only to the person who performed them.
