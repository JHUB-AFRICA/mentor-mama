# Programme Admin — People & access redesign

**Status:** Draft UX direction after Overview
**Audience:** Programme Administrator
**Related:** [Programme Admin workspace skeleton](34-programme-admin-workspace-skeleton.md)

## Purpose

People & access answers one operational question: **who can access the
programme, what role do they hold, and is their access still appropriate?**

This is an access-management workspace, not a contact directory. The primary
surface is a dense, calm table for comparison. Individual records open in a
contextual drawer so the administrator can inspect a person without losing
filters, pagination, or working context.

## Page structure

```text
Page header: People & access                         Invite person
Context line: Programme-wide access and role scope

Search people by name or email     Role       Status       Scope

PEOPLE                                               24 records
Name / email | Role | Scope | Status | Added | Actions
------------------------------------------------------------
Person row                                               ···
Person row                                               ···

Pagination
```

The page should use one primary bordered workspace surface around the query
controls and table. Rows are separated by rules; they are not individual
cards. The table header remains visible while scrolling on desktop. A compact
mobile list may stack row fields, but must preserve the same comparison order
and actions.

## Table contract

| Column | Content | Rule |
|---|---|---|
| Person | Full name and email | Email is secondary text; never truncate the name |
| Role | Programme role label | Use the product role vocabulary, not raw capability names |
| Scope | Institution/facility or programme-wide | Show “Scope required” when an invited role is incomplete |
| Status | Invited, active, suspended, deactivated | Status is text plus semantic colour, never colour alone |
| Added | Localised date | Keep it compact; full timestamp belongs in the drawer |
| Actions | One contextual action plus overflow | Avoid a button cluster in every row |

## Interactions

- **Invite person:** opens a dialog with role first, followed by only the
  institution/facility fields required by that role. Successful submission
  returns to the current table query and shows a non-blocking confirmation.
- **Row selection:** opens a person drawer; it does not navigate away from the
  table.
- **Overflow actions:** resend invitation, support recovery, suspend,
  reactivate, or deactivate only when the server-authorised state permits it.
- **Destructive or consequential actions:** use a confirmation dialog with the
  consequence, required reason, cancel action, and explicit action verb.
- **Role and scope:** are displayed as facts in the drawer. Casual editing of
  role/scope is not offered by this page.

## Person drawer

The drawer contains identity, role, scope, status, invitation/activation
milestones, last safe activity, and the permitted account action. It should
include a short “Access basis” section explaining that programme access is
role- and scope-governed. Restricted narratives and unrelated operational
records do not belong here.

## States

- **Loading:** table row skeletons that retain column rhythm.
- **Empty:** explain that no people match the current query and offer “Clear
  filters”; for a genuinely empty programme, explain “Invite the first person.”
- **Error:** preserve the query controls and show an inline retry message.
- **Invitation pending:** show resend as the direct row action and the age of
  the invitation in the drawer.
- **No permission:** do not render an access-management surface the server
  would reject; route back to an authorised workspace with a clear message.

## Responsive and accessibility rules

- Search and filters stack on narrow screens; the invite action remains easy to
  reach without competing with the page title.
- Every row action has a visible label or an accessible name that includes the
  person’s name.
- Keyboard focus is visible on filters, rows, drawer controls, and menu items.
- The drawer traps focus while open, closes on Escape, and returns focus to the
  triggering row.
- Status, role, and scope remain understandable in grayscale and at 200%
  zoom.

## Design boundary

This redesign changes the information hierarchy and interaction surfaces only.
It does not create new account lifecycle capabilities or change server-side
permission rules. Implementation follows after the Overview visual review.
