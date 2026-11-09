# Screen 11 — Set New Password

**Surface:** `apps/portal` reset-token route  
**Purpose:** Replace a forgotten password using a time-limited reset capability  
**Primary action:** Set new password

## Component hierarchy

```text
AuthLayout
├── AuthBrandPanel (desktop only)
└── AuthContent
    ├── PageTitle
    ├── ResetContext
    ├── NewPasswordField
    ├── ConfirmPasswordField
    ├── PasswordRequirements
    ├── SetPasswordButton
    └── SupportLink
```

## Security behavior

- The reset token is used only through the reset API and is never displayed.
- Successful reset invalidates the prior password and existing sessions
  according to the account policy.
- Do not automatically enter the workspace. Route to sign-in so the user
  understands that their password changed and any MFA requirement still
  applies.
- A used, expired, malformed, or revoked token gets one safe recovery state
  with a link to request a fresh reset.

## States

| State | UI treatment | Next action |
|---|---|---|
| Ready | New-password form and requirements | Set password |
| Invalid password | Field guidance | Correct password |
| Mismatch | Inline confirmation error | Correct confirmation |
| Submitting | Stable loading state | Wait |
| Success | Confirmation that password changed | Return to sign-in |
| Invalid token | Explain that link cannot be used | Request another link |

Use the same password guidance and accessibility behavior as activation to
avoid teaching two different security models.

