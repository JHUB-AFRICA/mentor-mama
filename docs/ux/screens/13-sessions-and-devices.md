# Screen 13 — Sessions and Devices

**Surface:** `apps/portal` Security settings  
**Purpose:** Give users understandable control over active sign-in sessions  
**Primary action:** Revoke a selected session

## Component hierarchy

```text
PortalShell
├── Sidebar / MobileNavigation
└── SettingsContent
    ├── Breadcrumbs
    ├── PageTitle: Security
    ├── SessionSummary
    ├── CurrentSessionCard
    ├── OtherSessionsList
    │   └── SessionRow
    │       ├── DeviceIcon
    │       ├── DeviceAndBrowser
    │       ├── ApproximateLocation
    │       ├── LastActive
    │       └── RevokeButton
    └── RevokeAllOtherSessionsAction
```

Use “sessions” as the primary term and explain “devices” in supporting copy;
one physical device may have multiple sessions. Do not present precise
location data when only approximate metadata is available.

## Row behavior and states

| State | UI treatment | Next action |
|---|---|---|
| Loading | Reserved rows prevent layout jump | Wait |
| Loaded | Current session marked clearly; other sessions actionable | Review |
| Revoke confirmation | Dialog names the selected session and consequence | Confirm / cancel |
| Revoking | Disable only the affected action | Wait |
| Revoked | Row removed or marked ended with confirmation | Continue review |
| Failed | Inline retry for the affected action | Retry |
| Empty | Explain that no other sessions are active | Return to settings |

The current session cannot be revoked through its own row. “Sign out of all
other sessions” is a separate, higher-consequence action with an explicit
confirmation dialog.

## Responsive and accessibility rules

- Desktop may use rows; mobile uses stacked session cards with the same reading
  order and actions.
- Device/browser details are text, not icon-only identification.
- Revoke dialogs use a focus-managed accessible dialog and return focus to the
  triggering action after close.
- Destructive actions use restrained danger styling and plain-language labels.
- Session data refreshes through server state management and shows stale/loading
  status without blanking the whole page.

