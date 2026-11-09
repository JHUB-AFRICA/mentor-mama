# Screen 14 — MFA Recovery

**Surface:** `apps/portal` support-assisted security route  
**Purpose:** Provide a controlled path when a user cannot use an authenticator or recovery code  
**Primary action:** Start recovery request

## Layout

```text
AuthLayout
└── AuthContent
    ├── SecurityStatusIcon
    ├── PageTitle
    ├── RecoveryExplanation
    ├── RecoveryOptions
    │   ├── RecoveryCodeRoute
    │   └── SupportRecoveryRoute
    ├── RecoveryRequestForm (when eligible)
    └── SupportGuidance
```

The self-service backup-code route remains the first option. Administrative
recovery is a controlled exception, not a hidden bypass and not a normal
password-reset continuation.

## States

| State | UI treatment | Next action |
|---|---|---|
| Backup code available | Direct backup-code challenge | Enter unused code |
| No code available | Explain support-assisted process | Start request |
| Request submitted | Neutral confirmation and expected next step | Wait for review |
| Request rejected | Explain that access remains protected | Contact programme support |
| Recovery completed | Require fresh sign-in and MFA setup | Sign in again |

The screen never promises immediate recovery. Tell the user to contact their
Programme Admins must use their organisation's platform administrator support
route if they cannot sign in; they cannot approve their own recovery request.
Other people should contact their Programme Admin. Administrative recovery must
include a reason, be recorded in the audit trail, revoke existing sessions, and
require new authenticator setup. Do not show administrators the user's setup
key or backup codes, and do not send those secrets by email.

