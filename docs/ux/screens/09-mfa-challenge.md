# Screen 09 — MFA Challenge

**Surface:** `apps/portal` sign-in continuation  
**Purpose:** Verify the second factor before granting access to the workspace  
**Primary action:** Verify and continue

## Component hierarchy

```text
AuthLayout
├── AuthBrandPanel (desktop only)
└── AuthContent
    ├── SecurityIcon
    ├── PageTitle
    ├── ChallengeExplanation
    ├── TotpCodeForm
    │   ├── CodeInput
    │   └── VerifyButton
    ├── UseBackupCodeLink
    ├── BackToSignInLink
    └── SupportLink
```

The page must not expose whether the account has a particular MFA method beyond
what the signed-in flow already requires. A short “Step 2 of 2” context helps
the user understand why credentials were accepted but access is not complete.

## Behavior and states

| State | UI treatment | Next action |
|---|---|---|
| Ready | Focused code field and clear explanation | Enter current code |
| Invalid code | Inline error with retry guidance | Try again |
| Too many attempts | Temporary lockout message and support route | Wait / contact support |
| Recovery mode | Replace code guidance with recovery-code instructions | Enter unused recovery code |
| Verifying | Stable loading state | Wait |
| Success | Short confirmation before workspace navigation | Continue |
| Session expired | Explain that sign-in must restart | Sign in again |

Support authenticator sign-in codes, one-time backup codes, and an enabled email
backup without requiring the user to return to the password screen. Clearly
explain that each backup code works once. If the user has neither an
authenticator nor a saved backup code, tell them to contact their programme
administrator; do not offer a bypass in the pending sign-in session.

## Accessibility and responsive rules

- Use one logical code input with paste support and a programmatic label.
- Announce errors and lockout status in a live region.
- Keep the back link available but secondary to verification.
- Never rely on a countdown alone; provide the time in readable text.
- Preserve the form at 320px width and support reduced motion.

