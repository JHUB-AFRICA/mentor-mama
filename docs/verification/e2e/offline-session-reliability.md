# EVIDENCE-004 — Mentor offline session reliability

**Requirement(s):** MVP Requirements §3 (idempotent session commands and visible
retry handling); §4 (exactly one server record or a visible Needs attention
item).

**Platform:** Local Chromium through Playwright, with local Django/PostgreSQL
and Redis.

**Starting state:** DEBUG-only `seed_e2e_mentor_workflow` created one active
placement and active mentor assignment. The mentor password was generated only
for the test process.

**Journey:**

1. Mentor signs in and opens the active placement.
2. A valid session is entered; the first session POST is browser-aborted to
   simulate signal loss.
3. The portal shows the saved item under **Waiting for signal**.
4. The mentor selects **Sync now**.
5. The portal reconciles command status, sends the original idempotent command
   only when absent, and removes the queue item after either a replayed command
   status or a new successful write.

**Observed result:** PASS — the Playwright journey completed in 3.7 seconds.
The test deliberately accepts both valid lost-response outcomes: a new `201`
write when the server never received the first request, or a committed command
status when it did.

**Supporting checks:** full backend suite reached 100% (76 collected tests),
portal lint and TypeScript checks passed, and the production portal build passed.

**Environment note:** the run was explicitly authorized despite a 12% free-disk
warning. No production provider or credential was used.
