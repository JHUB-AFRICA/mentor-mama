# Programme Admin post-login journey and responsibility map

**Status:** Draft interaction contract for product and implementation review  
**Audience:** Programme Administrator  
**Related:** [workspace design brief](33-programme-admin-workspace-design-brief.md), [workspace skeleton](34-programme-admin-workspace-skeleton.md), [people and access design](35-programme-admin-people-access-design.md), [placement design](36-programme-admin-placements-design.md), [domain implementation status](../../architecture/domain-implementation-status.md)

## Purpose of the role

The Programme Administrator keeps one programme configured, staffed, secure,
and observable. The role owns programme-wide setup and access governance,
reviews operational progress, and uses only the placement actions allowed by
the server capability and lifecycle rules. It is not an impersonation or
unrestricted override role.

The post-login experience should help the administrator answer, in order:

1. Is this the correct programme and account?
2. What needs attention now?
3. What is the safest next action, and what happens after I take it?

## Entry and first-use flow

```text
Sign in
  → required MFA challenge (Programme Admin policy)
  → authenticated session and capability map loaded
  → /admin Overview
  → resolve a prioritised attention item
  → land on the relevant workflow with context retained
  → receive a clear saved / queued / blocked result
  → return to the queue or continue to the next task
```

### Entry behavior

- The authenticated router sends a Programme Admin visiting `/` to `/admin`.
- The role requires MFA before product access. A missing or failed session must
  remain in the authentication flow; it must not render protected workspace
  data.
- The client receives server-owned capability flags for presentation. Every
  protected command must still be authorised and validated by its backend
  service.
- The pilot has a single programme scope. Show the programme name as context,
  not as a selector unless programme switching is implemented.
- Overview data should load independently with visible loading, empty, error,
  and retry states. A failed indicator request must not be represented as a
  healthy programme.

### First login

1. Show the programme identity and a short orientation to the workspace.
2. Prioritise unresolved setup and access tasks, such as missing directory
   records or invitations awaiting action.
3. Provide one clear next action per attention item and link to the exact page
   or record needed to complete it.
4. Explain blocked work in plain language and identify the owner or required
   prerequisite; do not offer a bypass.
5. As setup completes, remove resolved items from the queue and keep the
   administrator in the current workflow.

## Responsibilities and functions

| Responsibility | Programme Admin function | Expected result / guardrail |
|---|---|---|
| Orient to programme health | Review setup readiness, attention items, recent safe activity, and placement signals | One useful next action; health is derived from live data and never hardcoded |
| Manage people and access | Invite users with role-appropriate institution/facility scope; inspect status and scope; resend invitations; suspend, reactivate, or deactivate other accounts where allowed | Validate scope before submission; confirm consequential lifecycle actions; audit changes; never change role/scope casually after invite |
| Configure programme | Update programme name; create and maintain institutions/facilities and supported ward context; manage content where the content workflow permits | Field-level validation, ownership and downstream impact explained; no casual deletion |
| Coordinate placements | View programme placements; create/release and use other explicitly granted lifecycle commands | Hide or disable actions unless both capability and domain transition permit them; explain blockers; preserve reasons/audit where required |
| Review reports | View safe programme analytics and request supported exports | Scope and filters explicit; progress, completion, expiry, and failure visible; respect restricted-data/minimum-group rules |
| Review activity | Inspect programme-scoped audit history and safe change metadata | Read-only, filterable history; never expose restricted narrative through event payloads |
| Secure own account | Update profile, password, MFA, sessions, recovery settings, and preferences that are actually supported | Own-account security stays separate from other-user lifecycle controls; do not allow self-deactivation |

## Navigation and task flow

| Destination | User question | Main jobs and links |
|---|---|---|
| Overview | What needs attention now? | Review readiness and attention queue; open the relevant people, setup, placement, report, or activity record |
| People & access | Who can access the programme, with what scope? | Search/filter people; invite; inspect details; resend or manage permitted account lifecycle actions; review access policy |
| Programme setup | Is programme context ready for operations? | Update programme identity; maintain directory; continue to supported ward/module/content configuration |
| Placements | What is happening across the programme? | Filter/list/detail; create/release; take only permitted allocation, assignment, lifecycle, completion, withdrawal, and archive actions |
| Content library | What guidance is published to programme roles? | Browse drafts/published items; author/edit/publish where allowed; inspect immutable revisions |
| Reports | What evidence can I safely act on? | Review programme indicators; configure supported export scope; monitor export state and retrieve completed files |
| Activity | What changed, by whom, and when? | Filter and inspect safe, read-only audit events |
| Account settings | How do I keep my account secure and usable? | Profile, password, MFA, sessions/recovery, notifications/preferences, and sign out |

## Capability boundaries

The current server capability map grants Programme Admin: create/release,
allocate/assign, pause/resume, complete, archive, withdraw placements; review
escalations; export reports; and manage content. It does **not** grant
`log_session`, `open_induction`, `activate_placement`, student confirmation,
student assessment/feedback submission, or `review_feedback`.

Capability grants do not override domain invariants. Placement actions remain
conditional on legal lifecycle transitions, valid scope, required assignments,
capacity, and completion checks. Safeguarding review capability does not mean
that restricted narratives can be shown in general-purpose lists, dashboard
cards, notifications, or reports; use only the approved restricted detail
path. The current unresolved safeguarding policy questions remain release
constraints for any expanded narrative access.

The Programme Admin must never be offered controls to impersonate another role,
write a mentor session, sign an induction for a mentor, confirm a placement as
a student, edit submitted feedback, casually alter another account's scope, or
delete operational history.

## Feedback, errors, and recovery contract

Every write action should have these states:

1. **Ready:** the action is available, with required scope and consequence
   visible.
2. **Submitting:** prevent duplicate submission and show progress without
   losing the form or current table query.
3. **Succeeded:** state what changed and what happens next; update the current
   list/queue without a full context reset.
4. **Blocked:** show the server/domain reason and the prerequisite or owner;
   keep the record visible and do not imply a successful save.
5. **Failed:** preserve safe user input, provide a retry where idempotent, and
   avoid duplicate invites, exports, or lifecycle commands.
6. **Permission-limited:** explain that this account cannot perform the action
   and point to the authorised owner when known.

Use text plus semantic icon/color for status; announce asynchronous outcomes to
assistive technology. Privileged or destructive changes need a confirmation
that names the person/record, action, consequence, and reason requirement.

## Current implementation and wiring audit

This is a source inspection snapshot, not a claim that each journey has passed
live browser acceptance.

| Surface | Current evidence | Status for the experience |
|---|---|---|
| Post-login routing and MFA | Role router maps `/` to `/admin`; Programme Admin is in the required-MFA policy | Implemented; verify full authenticated end-to-end journey during acceptance |
| Overview | Live programme summary/indicator queries, attention/readiness panels, activity excerpt, invitation and navigation callbacks | Partly wired; validate each attention row destination and ensure health labels derive from live status/error state |
| People & access | Paginated people table, scoped invite flow, resend and account lifecycle operations, policy display | Implemented core; confirm each action's permission, confirmation, audit, and recovery states against approved authority matrix |
| Programme setup | Programme name and directory configuration surfaces exist | Partial; ward ownership/configuration and setup readiness contract need reconciliation |
| Placements | Programme Admin route and placement management surface exist; server has explicit capability-gated commands | Implemented core commands; lifecycle blockers and every action/result need end-to-end acceptance |
| Content | Programme Admin draft authoring/publishing, revision snapshots, role-filtered reads are present | In progress; media storage and publishing governance remain open |
| Reports | Analytics dashboard and scoped asynchronous exports are integrated | Pilot slice implemented; production storage policy/credentials/retention and broader analytics remain open |
| Activity | Programme-scoped paginated audit timeline exists | Implemented core; verify safe metadata and filter states |
| Own account/security | Account settings and MFA/session/recovery functions exist | Implemented core; verify links from header and success/error behavior |
| Header programme context | Programme name is fetched and displayed in a chevron-style container | UX mismatch: it looks interactive but is not a programme switcher; render as non-interactive context or wire a real selector when multi-programme scope exists |
| Navigation affordances | Sidebar entries include reports, people, setup, content, placements, activity; routes use client history and separate placement route | Needs journey-level wiring review: verify browser back/forward, direct URL load, active nav, page actions, and narrow-screen close behavior for every destination |

## Acceptance evidence for calling the journey complete

- Correct role lands on `/admin` after login and required MFA; other roles cannot
  render Programme Admin routes.
- Overview has no fake “all clear” state during loading, error, or incomplete
  data, and each attention item opens the correct filtered workflow.
- Each enabled control maps to a server capability and a domain command; denied
  and invalid-transition responses render a useful blocked state.
- Invite, account lifecycle, directory, placement, content, report export, and
  account security flows show pending, success, error, and permission states.
- Back/forward and direct route loads preserve route/title/active-navigation
  consistency. Mobile navigation closes after route selection.
- Audit evidence exists for governed changes, and restricted safeguarding or
  feedback text is not leaked through overview, reports, notifications, or
  activity.
- Keyboard and screen-reader use can reach every action and receive status
  announcements; responsive layouts preserve the task and context.

## Decisions still needed before expanding scope

- Confirm final ward administration and readiness ownership.
- Confirm approved Programme Admin safeguarding detail access while retention,
  operational ownership, and notification routing remain open.
- Confirm report/export retention and production storage governance.
- Decide whether the header programme context remains a label for the pilot or
  becomes a real selector as soon as multi-programme accounts are introduced.
- Resolve product-level lifecycle authority discrepancies, if any, against the
  identity capability matrix before surfacing actions in additional screens.
