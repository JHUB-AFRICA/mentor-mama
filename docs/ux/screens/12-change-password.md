# Screen 12 — Change Password

**Surface:** `apps/portal` Security settings  
**Purpose:** Let an authenticated user change their password deliberately  
**Primary action:** Change password

## Layout

```text
PortalShell
├── Sidebar / MobileNavigation
└── SettingsContent
    ├── Breadcrumbs
    ├── PageTitle: Security
    ├── SecuritySection: Password
    │   ├── CurrentPasswordField
    │   ├── NewPasswordField
    │   ├── ConfirmPasswordField
    │   ├── PasswordRequirements
    │   └── ChangePasswordButton
    └── SecuritySection: Sign-in activity summary
```

The security screen is a settings page, not a modal. A modal may be used only
for final confirmation when the change has session-wide consequences.

## Behavior

- Require the current password unless the backend account-recovery policy
  explicitly provides another authenticated route.
- On success, show a toast and an inline confirmation; do not rely on the toast
  alone.
- Explain whether other sessions were revoked and route the user back through
  sign-in if the current session is intentionally invalidated.
- Preserve non-secret fields on a failed request and clear password fields after
  a successful change.

## Accessibility and responsive rules

- Use clear section headings and a visible page title.
- Password controls have labelled visibility buttons with 44px targets.
- Destructive or session-affecting consequences are stated before submission.
- On mobile, sections stack vertically and the primary action remains easy to
  reach without a dense card layout.

