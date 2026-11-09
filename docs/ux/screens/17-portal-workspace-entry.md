# Screen 17 — Portal Workspace Entry

**Surface:** `apps/portal` authenticated application shell  
**Purpose:** Provide a calm, role-aware landing point after authentication  
**Primary action:** Continue into the user’s permitted work

## Entry states

```text
PortalShell
├── GlobalHeader
│   ├── LogoLockup
│   ├── ProgrammeContext
│   ├── Notifications
│   └── UserMenu
├── PrimaryNavigation
├── WorkspaceContent
└── Support / StatusFooter
```

The first screen is role-aware but not role-confusing. It should show the
programme context, the user’s own role, and only the navigation areas authorised
for that role. It must not present administrative controls merely because the
route exists in the frontend bundle.

## First-load behavior

- Display a reserved loading layout while profile, programme context, and
  permissions are fetched.
- If authentication is valid but required profile data cannot load, show a
  recoverable service state rather than a partially interactive dashboard.
- If the account status changes during the session, route to Account Status and
  revoke protected client state.
- Use server-state caching for data queries and local state only for transient
  navigation, dialogs, and form state.

## Visual direction

- Spacious content hierarchy with one clear page-level action.
- Use panels for related work, not a grid of decorative statistic cards.
- Keep the public brand language, but make the portal denser only where work
  requires it; readability and calm remain the priority.
- Use purposeful empty states that explain what is missing and what the user
  can do next.

