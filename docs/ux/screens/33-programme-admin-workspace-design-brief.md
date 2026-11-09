# Programme Admin workspace design brief

**Status:** Proposed UX direction for the next frontend redesign  
**Audience:** Programme Administrator  
**Primary job:** Keep the programme configured, staffed, secure, and moving by
finding the next operational decision quickly.

## Product truth

The Programme Administrator has programme-wide configuration and governance
authority. This is not a super-user role for performing every domain action.
Server capabilities and domain invariants remain authoritative; the interface
must never imply that an administrator can act as a student, mentor, nurse
manager, or coordinator.

The workspace should therefore feel like an operations console for programme
health, access, configuration, and exceptions—not a collection of KPI cards.

## End-to-end responsibility map

### 1. Establish the programme

- Maintain the programme name and identity used in the portal and programme
  communications.
- Create and maintain the organisational directory: institutions, facilities,
  and wards.
- Configure programme modules and content when those management surfaces are
  available.
- Review programme-wide analytics and exports without changing source records.

### 2. Establish the people and access model

- Invite Programme Admins, University Coordinators, Nurse Managers, Clinical
  Mentors, and Students within the programme’s approved scope rules.
- Assign an invited Coordinator or Student to an institution.
- Assign an invited Nurse Manager or Mentor to a facility.
- Resend, revoke, or issue a fresh invitation when policy permits.
- Suspend, reactivate, or deactivate any other programme account; never the
  administrator’s own account.
- Trigger password-reset support and revoke sessions where authorised.
- Perform a temporary, reason-coded, audited MFA recovery override.
- Review the server-owned capability and MFA policy matrix.

### 3. Monitor programme health

- See whether accounts are invited, active, suspended, or deactivated.
- Identify incomplete setup: missing institutions, facilities, wards, scoped
  staff, or pending invitations.
- Review programme-wide placement progress and exceptions through authorised
  read-side views.
- Review safe audit activity: who changed access or configuration, what changed,
  and when.
- Review operational attention signals without exposing restricted safeguarding
  text or confidential feedback beyond the approved access model.

### 4. Govern exceptional cases

- Use explicitly defined fallback or override actions only where the domain
  rules permit them.
- Supply a mandatory reason for an override.
- Preserve the audit trail and avoid silently editing operational records.
- Escalate unresolved policy, safeguarding-retention, or data-governance issues
  rather than inventing a bypass in the UI.

## Explicitly out of scope for this role

The Programme Admin cannot:

- Log a mentorship session for a mentor.
- Complete or sign a student induction on behalf of a mentor.
- Confirm a placement as the student.
- Edit submitted feedback or expose confidential feedback by default.
- Read safeguarding descriptions or action notes outside the approved access
  path.
- Force an illegal placement transition or bypass capacity, scope, or completion
  blockers.
- Change another user’s role or organisation scope after invitation through a
  casual profile edit.
- Delete operational records; removal is archival and audited.

## Information architecture

The redesign should use a stable workspace frame with a quiet navigation rail
and a task-oriented main area. The navigation is organised around the Admin’s
jobs, not around backend modules:

```text
Programme Admin
├── Overview             programme health and next actions
├── People & access      users, invitations, account lifecycle, access policy
├── Programme setup      institutions, facilities, wards, modules, content
├── Placements           programme-wide operational read-side and allowed fallback actions
├── Reports              programme analytics and exports
├── Activity             immutable audit trail and configuration history
└── Settings             programme identity, account security, notification preferences
```

Support should be available from the account/help affordance rather than
competing with operational navigation unless it has a real support workflow.

## Screen responsibilities

### Overview

Answer one question: **“What needs my attention in the programme today?”**

The page should lead with an attention queue and a concise programme context
line. It should show a short, prioritised list of actionable conditions such as
pending invitations, incomplete organisation setup, access risks, or placement
exceptions. Counts may support the queue, but they should not be the primary
composition. A restrained activity excerpt and a single next action are enough.

### People & access

Answer: **“Who has access, what is their scope, and what can I do safely?”**

Use a real dense table/list with clear columns, filters, row-level status, and an
overflow action menu. The row is not a card. Details open in a drawer or page
without losing the current query. Invitation and lifecycle actions must show
scope, consequence, confirmation, and result.

Suggested table columns: Person, Role, Organisation scope, Status, Last activity,
and Actions. On narrow screens, columns collapse into a readable stacked row with
the same labels and a persistent action affordance.

### Programme setup

Answer: **“Is the programme’s operating context ready?”**

Use a settings-style sectioned workspace with clear subsections for directory,
wards, modules/content, and setup status. Each section should have one primary
action, inline validation, and a visible relationship to downstream workflows.
Do not present every entity as a tile grid.

### Placements

Answer: **“What is happening across the programme, and where is intervention
permitted?”**

Use a filterable operational table and exception views. Programme-wide access
does not grant authority to perform every placement command. Each row must show
what is readable, what is actionable, and why an action is unavailable.

### Reports

Answer: **“What programme-level evidence can I safely act on?”**

Use report sections and data tables/charts only where they support a decision.
Respect minimum-group and restricted-data rules. Exports need scope, audit, and
clear progress/failure feedback.

### Activity

Answer: **“What changed, by whom, and when?”**

Keep the append-only audit timeline compact and scannable. Use expandable safe
metadata for details; never turn it into a decorative social feed.

## Design contract

- **Direction:** calm, precise, formal, and operational; MentorMAMA’s care is
  expressed through clarity and safe recovery, not decorative warmth.
- **Hierarchy:** attention queue first, contextual evidence second, configuration
  and history after the primary decision.
- **Composition:** tables, lists, split panes, sectioned settings, and drawers
  are preferred where the information is comparative or operational. Cards are
  reserved for a meaningful summary or a distinct state.
- **Action hierarchy:** one primary action per screen; destructive or privileged
  actions live in an overflow menu and require explicit confirmation/reason.
- **Typography:** retain the established MentorMAMA type tokens, but use a more
  compact operational scale for tables and settings.
- **Color:** reserve teal for primary actions and focus, semantic colours for
  status/attention, and quiet neutrals for chrome and separation.
- **Responsive behavior:** desktop uses a persistent rail and wide tables;
  tablet uses a reduced rail or drawer; mobile uses an off-canvas rail, stacked
  rows, and full-width actions. No header text may distort or compete with the
  account controls.
- **States:** every data surface must support loading, empty, error/retry,
  permission-limited, success, and offline/queued feedback where applicable.
- **Accessibility:** semantic navigation/table markup, keyboard-visible focus,
  labelled controls, adequate touch targets, and status messages that do not
  rely on colour alone.

## Redesign sequence

1. Rebuild the shared Programme Admin frame and navigation vocabulary.
2. Redesign Overview around the attention queue and programme readiness.
3. Redesign People & access as a dense, task-oriented access table.
4. Move programme setup into a sectioned configuration workspace.
5. Add the programme-wide placement/report read-side surfaces only after their
   data contracts and permissions are confirmed.
6. Validate desktop, tablet, mobile, empty, error, and restricted states through
   a real Programme Admin browser journey.

This brief is a UX boundary and information-architecture decision. It does not
change server capabilities or grant new Programme Admin authority.
