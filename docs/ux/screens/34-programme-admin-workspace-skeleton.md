# Programme Admin workspace skeleton

**Status:** UX direction proposed for implementation
**Stage:** UX
**Audience:** Programme Administrator
**Related:** [Programme Admin workspace design brief](33-programme-admin-workspace-design-brief.md), [role-owned workspace ADR](../../architecture/decisions/0015-role-owned-portal-workspaces.md)

**Scope clarification:** The existing decorative visual language remains valid
for login, MFA, invitation, password-recovery, and account-security screens.
This redesign applies only to authenticated dashboards and workspaces.

## Decision in one sentence

The Programme Admin portal is a calm programme-operations workspace organised
around seven jobs: orient, manage access, configure the programme, monitor
placements, inspect evidence, review change history, and secure the account.

It is not a universal operational workspace and must not imply that the admin
can perform student, mentor, nurse-manager, or coordinator work on demand.

## 1. Permission model

### Scope

The Programme Admin has programme-wide read scope and programme-wide authority
only for capabilities explicitly granted by the server. The account has no
institution or facility scope of its own. The frontend presents the capability
map for orientation; the backend remains the authorization boundary.

### Allowed responsibilities

| Responsibility | Admin can do | Product boundary |
|---|---|---|
| Programme identity | Read and update the programme name | Changes are audited; no casual branding editor is implied |
| Directory | Create and maintain institutions and facilities; maintain the ward directory within each facility | Ward records are facility-owned context for allocation. Programme Admin maintains name/capacity/availability metadata; Nurse Managers operate placements and mentors within their facility. Deletion is not a casual action |
| Access | Invite programme roles with valid institution/facility scope; resend invitations; activate, suspend, deactivate, and support recovery where permitted | Role and organisation scope are not editable through a casual person edit |
| Access policy | Review roles, scopes, MFA requirements, and capabilities | The policy matrix is read-only from the product surface |
| Placements | Read programme-wide placements; create/release, allocate, assign, pause/resume, complete, withdraw, and archive only where the server capability and lifecycle state allow | The admin cannot bypass capacity, scope, transition, or completion blockers |
| Safeguarding | See authorised operational metadata and review concerns through the approved access path | Restricted narratives and action notes are not exposed by default |
| Reports | Request approved programme or cohort exports and view safe monitoring data | Export scope, retention, and restricted-data rules remain server-owned |
| Audit | Read programme-scoped immutable activity | Activity is evidence, not an editable feed |
| Account security | Manage own password, MFA, sessions, recovery support, and notification preferences | The admin cannot deactivate their own account through the people surface |

### Explicitly unavailable

The workspace must not offer controls for logging a mentor session, signing an
induction as a mentor, confirming a placement as a student, editing submitted
feedback, reading confidential feedback by default, forcing illegal lifecycle
transitions, changing another user’s role/scope after invitation, or deleting
operational records.

### Capability-to-surface map

| Server capability / authority | Surface | Presentation rule |
|---|---|---|
| `create_placement`, `release_placement` | Placements | Show only when state and required assignment data make the action meaningful |
| `allocate_ward`, `assign_mentor` | Placement detail | Show as controlled handoff actions, with scope and capacity feedback |
| `pause_placement`, `resume_placement`, `withdraw_placement` | Placement detail overflow | Require reason and show consequence before confirmation |
| `complete_placement` | Placement detail | Show only when blockers are resolved; expose blocker explanation when unavailable |
| `archive_placement` | Placement detail overflow | Show only for eligible completed records; require audited confirmation |
| `review_escalation` | Safeguarding/attention surfaces | Show safe metadata first; open restricted detail only through the authorised path |
| `export_reports` | Reports | Use an explicit scope/filter step, asynchronous progress, expiry, and failure recovery |
| Account lifecycle and MFA recovery authorities | People & access / Account security | Privileged actions live in overflow menus and require confirmation/reason |

## 2. Workspace frame

### Desktop shell

```text
┌──────────────────────┬────────────────────────────────────────────────────┐
│ MentorMAMA           │ Programme workspace · Current page        alerts  ◎ │
│ Programme Admin      ├────────────────────────────────────────────────────┤
│                      │                                                      │
│ WORKSPACE            │ Page title                                           │
│  Overview            │ Short context line                  primary action  │
│  People & access     │                                                      │
│  Programme setup     │ Main task surface: table / queue / settings / report │
│  Placements          │                                                      │
│  Reports             │                                                      │
│  Activity            │                                                      │
│                      │                                                      │
│ ACCOUNT              │                                                      │
│  Settings            │                                                      │
│  Help                │                                                      │
│  Signed-in identity  │                                                      │
│  Sign out            │                                                      │
└──────────────────────┴────────────────────────────────────────────────────┘
```

The rail is persistent on desktop and becomes an off-canvas drawer on smaller
screens. It is a navigation rail, not a stack of promotional panels. Active
state uses a quiet filled treatment and a text label; icons never carry the
meaning alone.

### Sidebar navigation

#### Workspace

1. **Overview** — programme health, readiness, and next actions
2. **People & access** — users, invitations, lifecycle, and access policy
3. **Programme setup** — identity, directory, wards, modules, and content
4. **Placements** — programme-wide operational list and allowed interventions
5. **Reports** — monitoring views and approved exports
6. **Activity** — immutable programme audit trail

#### Account

7. **Settings** — personal profile, password, MFA, sessions, notifications,
   and programme identity where the user is authorised
8. **Help** — support/account guidance only until a real support workflow exists
9. **Sign out** — session termination

Help is deliberately secondary. If no support workflow or content exists, it
should be an account-menu item rather than an empty top-level destination.

### Header

The header has four jobs, in this order:

1. **Orientation:** workspace label, page title, and optional breadcrumb for a
   nested detail surface.
2. **Page action:** one primary action owned by the current page, such as
   “Invite person”, “Add institution”, or “Create placement”.
3. **Notifications:** inbox popover with unread count, loading, empty, error,
   and mark-read states.
4. **Account:** signed-in name, “Programme Administrator” role label, and a
   compact menu for account/security actions.

There is no programme switcher in the pilot because the admin is scoped to one
programme. A future multi-programme model must add explicit scope switching;
it must not be simulated with a decorative selector.

## 3. Page inventory

There are **seven top-level workspace pages**. Detail drawers, dialogs, tabs,
and filtered views are contextual surfaces within those pages, not additional
sidebar destinations.

| Page | Primary question | Primary surface | Main actions |
|---|---|---|---|
| Overview | What needs attention today? | Prioritised attention queue with compact signals | Open the next issue; review setup; review invitations |
| People & access | Who has access and what is their scope? | Dense paginated access table | Invite; inspect; resend; suspend/reactivate/deactivate; recovery support |
| Programme setup | Is the operating context ready? | Sectioned settings workspace | Update identity; create directory records; inspect readiness |
| Placements | What is happening across the programme? | Filterable operational table and detail view | Create/release; allowed allocation, assignment, lifecycle actions |
| Reports | What evidence can I safely act on? | Monitoring sections, tables, and export queue | Filter; inspect safe indicators; request/download approved export |
| Activity | What changed, by whom, and when? | Compact paginated audit timeline | Filter; expand safe change metadata |
| Settings | How do I keep this account and programme secure? | Account/security settings sections | Password; MFA; sessions; notifications; programme identity |

### Contextual surfaces

- **Person drawer:** identity, role, scope, status, last activity, and safe
  lifecycle actions without losing the current People query.
- **Placement detail:** lifecycle, assignments, blockers, activity, and
  capability-gated actions.
- **Invite dialog:** role first, then the required institution/facility scope;
  no free-form scope assignment.
- **Confirmation dialog:** consequence, reason field when required, cancel,
  and an explicit action verb.
- **Export progress surface:** queued/running/completed/failed/expired states;
  never a silent download.

## 4. Page order and first-use path

The first-use path is intentionally short:

1. Sign in and complete MFA.
2. Land on **Overview** with programme name, readiness signals, and one clear
   next action.
3. Resolve the highest-priority setup or access issue.
4. Return to the queue or move to the relevant operational page.

The navigation should not force a tour. Empty states should explain the next
useful setup action, and completed setup should reduce the queue rather than
add celebratory dashboard content.

## 5. Shared visual and interaction rules

- Use the established navy, teal, quiet neutral, Figtree/Noto Sans, Lucide,
  focus, and responsive tokens already present in the portal.
- Use tables for comparable records, lists for attention, and sectioned forms
  for configuration. Cards are reserved for a meaningful summary or a distinct
  state—not as the default container.
- Each page has one primary action. Privileged and destructive actions belong
  in a labelled overflow menu.
- Status must have text and/or an icon, not colour alone.
- Preserve query, filters, and table position when opening a drawer and after a
  successful row action.
- Every data surface defines loading, empty, error/retry, permission-limited,
  success, and narrow-screen behavior before implementation.
- Desktop uses a persistent rail and dense table; tablet reduces chrome; mobile
  uses the off-canvas rail, stacked labelled rows, and full-width actions.
- Keyboard focus, semantic navigation/table markup, 44px touch targets, and
  reduced-motion behavior are part of the shell contract.

## 6. Implementation sequence

1. Replace the Programme Admin-specific frame with this navigation vocabulary
   and header contract while retaining existing route ownership.
2. Recompose Overview around the attention queue and readiness states.
3. Rebuild People & access as the dense table and contextual drawer.
4. Recompose Programme setup as a sectioned configuration workspace.
5. Reconcile Placements and Reports against confirmed read/action contracts;
   do not add navigation for data that has no approved backend surface.
6. Validate desktop, tablet, mobile, empty, error, permission, and keyboard
   states through a real Programme Admin browser journey.

## Decision boundaries and open items

This skeleton does not grant new authority, introduce a programme switcher,
create a content-management domain, or expose restricted safeguarding and
feedback narratives. The following remain product/architecture decisions before
the related page is implemented:

- final ward-management contract and ownership;
- module/content ownership and publishing rules;
- approved safeguarding narrative access for Programme Admin;
- report retention and export governance;
- whether Help merits a page once support content/workflow exists.
