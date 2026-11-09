# Programme Admin overview

## Purpose

The first authenticated workspace view gives a Programme Admin a calm, actionable
programme control room. It prioritises access decisions, programme readiness,
content governance, and recent change rather than presenting generic analytics.

## First-use orientation contract

The first-use view should help the Programme Admin answer these questions in
order: **Which programme and account am I in? What is already configured? What
is the next valid action? Which work belongs to the other roles?** Keep this
orientation in the Overview and its persistent shell; do not force a blocking
tour or make users finish a wizard before they can use the portal.

When setup is incomplete, show a compact, server-backed **Getting started**
sequence: confirm programme identity, configure institutions/facilities, invite
operational leads, and prepare learning/content when it is in pilot scope. Each
step needs a truthful state (not started, in progress, complete, needs attention,
or unavailable), one direct destination, and any prerequisite/owner. Choose one
primary action based on the earliest unmet prerequisite. For example, do not
make Invite person the dominant first-use action while the required directory
scope is absent.

Do not equate zero attention items with programme readiness. Missing programme
identity or directory configuration must remain visibly incomplete even when
there are no active placements or pending invites. Derive setup state from
persisted domain data; do not assume a first-login flag exists. After setup, the
same Overview should shift emphasis to current attention and recent activity
without replaying a welcome flow.

## Composition

- A navy navigation rail grouped into **Operate** (Overview, Placements, Reports),
  **Govern** (People & access, Programme setup, Content library), and **Review**
  (Activity). Personal Settings and Sign out remain separated at the rail bottom.
- A contextual header with breadcrumb, live programme name, notifications, and the
  signed-in account menu.
- A compact page heading with programme status, recent activity, and the primary
  next action. Operational role ownership is explained in Programme governance.
- A primary action chosen from the earliest unmet setup prerequisite.
- A Getting started progress line while identity, directory review, lead access,
  or policy-required mentor training remains incomplete. Completed steps use
  filled circles; the section leaves the page when all displayed steps finish.
- A two-column decision area: Needs attention and Programme readiness. Both panels
  use live summary data and link directly to the owning workflow.
- A two-column evidence area: Recent programme activity and Programme governance.
  Activity is read from the programme audit API; content counts are read from the
  content API; governance links to access policy, security, content, and setup.
- The invitation action opens the existing focused modal for name, work email, role,
  scope, and optional phone contact data. Submission remains on the authenticated
  invitation endpoint and reports success or failure in context.

## Current implementation review

The Overview and Programme Admin shell provide role and programme context,
readiness/attention panels, activity/governance summaries, and links to owned
workflows. The first-use enhancement now adds a prerequisite-aware primary
action, a checklist backed by the existing programme summary/settings APIs, URL
addressable setup sections, truthful initial-loading/error states, and a
required mentor-training check when the programme policy requires it. Draft
content is labelled for review rather than presumed ready to publish. These
changes are source-implemented but still need a fresh bootstrap Programme Admin
live run before acceptance.

The current summary only reports active Coordinator and Nurse Manager totals,
not complete scope coverage or pending invitations by role. The Overview
therefore routes to People & access to review operational access instead of
blindly creating invitations. The current directory readiness heuristic checks
that at least one institution and facility exist; it does not assert full ward
or scope coverage. The UI calls this “core setup recorded,” not overall
programme readiness. Ward ownership and full operational coverage remain
decisions/integrations for a later slice.

## Responsive behavior

- At desktop widths, the navigation rail is visible and the content shell reserves
  its width explicitly. The attention/readiness and activity/governance pairs use
  two columns.
- Below the desktop breakpoint, the rail becomes an off-canvas drawer with an
  overlay and menu button. Dashboard panels collapse to one column.
- Readiness cards remain three-up when space allows, then collapse into a vertical
  sequence inside the readiness panel.
- The page heading and primary action stack on narrow screens without horizontal
  scrolling.

## Visual rules

- Use the shared navy, teal, mist, border, and typography tokens.
- Use restrained radii, compact hierarchy, and meaningful whitespace over very
  long controls or oversized empty regions.
- Use teal, warning, and error treatments only for semantic status; icons are
  supportive signals, not decoration competing with the action.
- Use outlined panels and thin dividers to reflect the reference design while
  reserving stronger emphasis for attention items and primary actions.
