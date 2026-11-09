# Screen 07 — MFA Setup

**Surface:** `apps/portal` first-login security setup  
**Purpose:** Help a user connect an authenticator app for protected sign-in  
**Primary action:** Connect authenticator

## Layout

```text
AuthLayout
├── AuthBrandPanel (desktop only)
└── AuthContent
    ├── SecurityStepIndicator
    ├── SecurityIcon
    ├── PageTitle
    ├── Explanation
    ├── SetupInstructions
    │   ├── BrandedQRCodePanel
    │   ├── ManualSetupKeyDisclosure (collapsed by default)
    │   └── AuthenticatorAppHint
    ├── VerificationCodeField
    ├── EnableMfaButton
    └── CannotScanLink
```

The QR code carries the existing `MentorMAMA` issuer label and displays the
MentorMAMA icon in its centre, with high error correction and a clear quiet
border. A third-party authenticator controls its own account icon; the QR logo
brands the setup screen and does not guarantee another app will show the same
logo. “Can’t scan?” reveals the setup key only when requested. The key is never
placed in analytics, support views, or ordinary account details.

## Required behavior

- Explain in plain language that the authenticator app adds a sign-in check.
- Show the branded QR first; reveal the setup key only through “Can’t scan?”.
- Keep the setup session-bound and expire it according to the backend policy.
- Verify the first TOTP code server-side before marking MFA complete.
- On success, show “Authenticator connected” and then the backup codes once.
- Explain that each backup code works once and require confirmation that the
  user saved them before continuing.
- If setup fails, preserve the setup context where safe and provide retry
  guidance; do not generate an unbounded number of new secrets.

## States

| State | UI treatment | Next action |
|---|---|---|
| Setup ready | MentorMAMA QR and two short setup steps | Configure authenticator |
| Setup key expanded | Private manual key and copy action | Add the account manually |
| Invalid code | Inline error and retry guidance | Enter current code |
| Submitting | Stable loading state | Wait |
| Expired setup | Explain that setup must restart | Restart setup |
| Completed | Authenticator connected confirmation | Save backup codes |
| Unsupported role policy | Route according to account policy, never silently bypass | Follow required path |

## Responsive and accessibility rules

- QR code has an accessible text alternative containing setup guidance, not the
  secret in an unprotected label.
- Code input has an explicit label and supports keyboard/paste entry.
- The manual secret disclosure is keyboard accessible and does not trap focus.
- On mobile, QR code and manual setup remain within the viewport with generous
  spacing; the code form follows below rather than beside it.
- Use restrained motion only for revealing setup progress.

