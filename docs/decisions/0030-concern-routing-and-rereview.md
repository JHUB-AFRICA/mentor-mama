# ADR 0030 — The submitter chooses who reviews a concern; they can ask for another review

Status: accepted (2026-11-11, product owner direction). Amends ADR 0029 rule 5 and the "closed concerns cannot be reopened" rule.

## Context

Every concern used to reach the facility's nurse managers, and also the institution's coordinators when it was high severity. Coordinators could take any concern on a placement in their institution. A student worried about ward staff could not keep a concern away from the nurse manager, and a student worried about the university side could not keep it away from the coordinator. Students also had no screen to follow a concern after submitting it, and no way to contest an outcome.

## Decision

1. **Routing is chosen, not defaulted.** `Escalation.routed_to` is `nurse_manager`, `coordinator` or `both`, and the API requires it on raise (HTTP 400 when missing). The form starts with nothing selected. A concern without a placement can only be reviewed by the nurse manager, because no coordinator is in scope.
2. **Not chosen means it does not exist for you.** Reviewers outside the route do not see the concern in the queue, cannot open its summary (404), cannot take it, are not notified, and do not see it counted in placement progress, dashboard counts, insights or exports. Severity no longer widens the audience.
3. **Mentors and students see only their own concerns counted.** Before this change, placement progress showed the mentor the number of open concerns on their student's placement, including concerns that might be about the mentor.
4. **Programme admins keep oversight** of every concern (unchanged, audited on read).
5. **Re-review.** The person who raised a concern may ask for another review once it is `resolved` or `closed`, with a reason of at least 10 characters. It returns to `open` with no reviewer, goes back to the same chosen reviewers (who are notified), and keeps the earlier finding and action on the record. `rereview_reason`, `rereview_requested_at` and `rereview_count` are stored. Each round is audited (`escalation.request_rereview`).

## Consequence and accepted trade-off

The completion blocker still counts every open concern on a placement. A placement cannot complete over an open concern, so a nurse manager who was not chosen will see "This placement cannot be completed while a concern is still open." That reveals that a concern exists, never its category, severity or content. We accept this because silently completing a placement with an unresolved concern is worse.

Existing concerns were migrated as `both`, which matches who could see them before.

## Open

- Whether a concern may be re-reviewed an unlimited number of times. Currently unlimited, and every round is counted and audited.
- Whether a re-review should be able to go to a different reviewer (for example, to the coordinator when the nurse manager's outcome is contested). Currently it goes back to the same route; a programme admin can reassign.
