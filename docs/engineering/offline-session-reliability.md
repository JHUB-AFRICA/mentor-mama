# Offline Session Reliability — implementation plan

**Status:** Build approved · verification pending resource gate

## User outcome

A clinical mentor can finish a session log even with no signal, see exactly what
is waiting to sync, and deliberately resolve any rejection. A saved draft or
queued command must never disappear without an explicit user action.

## Scope

This slice applies only to the existing mentor session command. It adds:

- durable, account-scoped session drafts and command records in IndexedDB;
- a single session queue state machine: `draft → queued → syncing → synced` or
  `needs_attention`;
- automatic reconciliation when connectivity returns and an explicit **Sync
  now** action;
- `GET /api/v1/commands/{command_id}` reconciliation before a resend; and
- a compact Mentor workspace panel that surfaces attention items first.

It does **not** turn every portal write into an offline command, add background
sync/service-worker behaviour, or change server authority. The server remains
the sole validator of assignment, placement state, session window, and scope.

## Privacy and safety boundaries

- Queue entries are partitioned by authenticated user ID and are never shown to
  another signed-in user.
- The current session form persists only date, session type, and topic codes;
  it does not add local persistence of optional free text in this slice.
- Queue records contain no patient-identifiable field. The existing no-patient-
  identifiers instruction remains the rule for any future free text.
- A non-retryable server response is retained with a plain-language reason. A
  user can retry after a state change or discard deliberately; the client never
  accepts a late command locally.

## Design brief

**Inherited:** MentorMAMA's calm operational language, navy/teal/mist tokens,
and the existing focused participant workspace.

**Adapted:** the mentor's placement list gains a small operational status
surface rather than a dashboard. Needs-attention work appears before waiting
work because it can block accurate clinical record keeping. The normal session
form remains the primary task.

**Responsive behaviour:** on narrow screens, queue rows remain a single
column with full-width actions; on wider screens, status and actions sit on one
line. Controls use visible labels and preserve keyboard access.

## Acceptance criteria

1. A network failure after session submission creates one durable queued item
   with the original UUID idempotency key and immediately confirms local save.
2. On reconnect or **Sync now**, the client first checks command status. A
   committed command is removed without another POST; an unknown command is
   safely submitted using the same key.
3. A retryable failure returns the item to `queued`. A non-retryable failure
   moves it to `needs_attention`, retains its details, and shows the server
   message.
4. A session rejected because the placement is paused, closed, or reassigned is
   never silently discarded or accepted retroactively.
5. Pending items are visible only to the account that created them; signing in
   as a different user cannot reveal them.
6. Existing online session behaviour and idempotent duplicate handling remain
   unchanged.

## Verification plan

- Focused client tests cover queue persistence and the command-state decision
  table.
- Browser journey: mentor logs a session while the POST is interrupted, sees a
  queued confirmation, reconnects, and observes exactly one server session.
- Browser rejection journey: queue a session, pause or reassign the placement,
  sync, and confirm the item moves to Needs attention with no data loss.

Verification is currently deferred because the project volume is below the
SEOS 15% free-space gate. No production credentials or providers are involved.
