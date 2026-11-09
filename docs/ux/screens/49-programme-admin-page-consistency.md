# Programme Admin page consistency

## Goal

Give Programme Admins one visual system across Overview, Placements, Reports,
People & access, Programme setup, Content library, Activity, and account settings.
The Content library catalogue is the visual reference supplied for this pass.

## Shared page structure

- Keep the existing programme navigation rail and contextual top bar.
- Use a compact page heading with an eyebrow, one 36px title, a short
  task-focused description, and one primary action when the page has one.
- Keep page content within a 75rem reading width and use the same page rhythm.
- Use white surfaces, thin blue-grey borders, 12px corners, and restrained
  spacing. Keep tables, charts, filters, tabs, and operational forms in the
  structure best suited to their content.
- Use consistent 16px card padding, 19px section headings, 14–15px supporting
  text, and semantic teal, warning, and error states.
- On narrow screens, stack the page heading and its action, collapse multi-column
  summaries, and preserve horizontal scrolling only for dense tables or tabs.

## Page-specific hierarchy

- **Overview:** readiness and attention remain first; recent activity and
  governance remain supporting evidence. The decorative brand statement is
  removed so the next programme action is easier to scan.
- **People & access:** page heading and invite action precede summary counts,
  recovery requests, and the people register.
- **Programme setup:** the identity, directory, and access-policy tabs and their
  existing workflows remain unchanged.
- **Reports and Activity:** filters, period controls, charts, and audit events
  keep their page-specific layouts while sharing the same title scale, width,
  cards, and spacing.
- **Placements and Content:** lifecycle tables, content tabs, and authoring/detail
  flows retain their established task-specific interactions.

## Acceptance criteria

- Programme Admin page roots align to the same 75rem maximum width.
- Page titles use a consistent 36px desktop scale and 32px small-screen scale.
- Summary cards and information panels use the shared border, radius, and padding.
- People & access has a clear top-level page heading and invitation action.
- Overview no longer gives decorative promotional copy equal prominence to
  readiness and operational actions.
- Existing URLs, filters, forms, table actions, and authorization behavior remain
  intact.

## Rollback

Revert the scoped Programme Admin layout, typography, card, and heading changes
in `programme-admin.css`, `reports.css`, `ProgramAdminDashboard.tsx`, and
`PeopleTable.tsx`. No data or API changes are part of this design update.
