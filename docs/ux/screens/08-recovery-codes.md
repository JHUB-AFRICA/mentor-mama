# Screen 08 — Recovery Codes

**Surface:** `apps/portal` mandatory post-MFA setup step  
**Purpose:** Give the user a safe backup for account access if their authenticator is unavailable  
**Primary action:** Confirm backup codes saved

## Component hierarchy

```text
AuthLayout
├── AuthBrandPanel (desktop only)
└── AuthContent
    ├── SecurityStepIndicator
    ├── PageTitle
    ├── BackupCodeExplanation
    ├── BackupCodePanel
    │   ├── CodeList
    │   ├── CopyAllButton
    │   └── DownloadButton
    ├── SavedConfirmationCheckbox
    ├── ContinueButton
    └── RecoveryWarning
```

Backup codes are shown once in a controlled success state. The user must
confirm that they have stored them before continuing. The page must not make
printing or downloading mandatory, because secure password managers are valid
storage options.

## Safety behavior

- Codes are never included in email, analytics, error reports, support views, or
  ordinary application logs.
- Explain that each backup code works once.
- Copy and download actions provide immediate, non-sensitive confirmation such
  as “Recovery codes copied”; never echo the codes in a toast.
- The continue button remains disabled until the saved confirmation is checked.
- Leaving the page produces a clear warning that the codes may not be shown
  again, without blocking normal browser navigation indefinitely.
- Regeneration later belongs in Security settings and invalidates the previous
  set after explicit confirmation.

## States

| State | UI treatment | Next action |
|---|---|---|
| Codes available | Secure list with save options | Store backup codes |
| Copied/downloaded | Brief confirmation toast | Confirm saved |
| Not confirmed | Continue disabled with explanation | Check confirmation |
| Continue submitted | Loading state | Enter workspace |
| Recovery-code retrieval failure | Safe retry or support guidance; do not show partial codes | Retry |

## Accessibility and responsive rules

- Render codes in a readable, selectable monospace treatment with sufficient
  spacing and no colour-only grouping.
- The code list has a meaningful label and can be navigated by keyboard.
- Copy/download controls have explicit accessible names and 44px targets.
- On small screens, codes may be presented in a single column with a sticky
  bottom action only if it does not cover content or keyboard focus.
- Success is communicated through text and a live region, not only a check icon.

