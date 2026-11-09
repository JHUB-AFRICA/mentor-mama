# Screen 06 — Email Verification

**Surface:** `apps/portal` account verification route  
**Purpose:** Confirm ownership of the invited email before protected access is granted  
**Primary action:** Verify email

**Implementation status:** Deferred for the initial invitation flow. The
invitation link already proves control of the invited email address. Email
verification remains a future capability for email-address changes and
account-recovery hardening, where it will use `POST /api/v1/auth/email/verify`
and `POST /api/v1/auth/email/resend`.

## Layout

```text
AuthLayout
├── AuthBrandPanel (desktop only)
└── AuthContent
    ├── StepIndicator: Account created → Verify email → Secure account
    ├── StatusIcon
    ├── PageTitle
    ├── VerificationExplanation
    ├── VerificationCodeForm
    │   ├── CodeInput
    │   ├── VerifyButton
    │   └── ResendLink
    ├── DeliveryContext
    └── SupportLink
```

The page confirms only the masked destination, for example
`b••••@example.org`. It never exposes a full email address in a place where it
could be observed by someone with temporary screen access.

## Code interaction

- Use one logical input with an accessible label; visual grouping may show six
  slots without creating six confusing tab stops.
- Support paste and keyboard entry, while ignoring spaces and harmless
  formatting characters.
- Auto-submit only when the complete code is entered if this does not create
  surprising behavior; the explicit verify action remains available.
- Resend is rate-limited and shows when it becomes available again.
- Never clear the code on a harmless network retry unless the server rejects it.

## States

| State | UI treatment | Next action |
|---|---|---|
| Code sent | Masked destination and active code field | Enter code |
| Verifying | Stable button loading state | Wait |
| Incorrect/expired code | Plain-language inline error | Try again or request a new code |
| Resend cooldown | Visible countdown and disabled resend action | Wait |
| Verified | Success state with next-step explanation | Continue to MFA setup |
| Delivery failure | Retry/resend guidance without exposing provider details | Retry or contact support |

The verified state should make it obvious that email verification is complete
but account security setup is still required.

## Accessibility and trust

- Announce verification errors and resend status through a live region.
- Do not rely on colour or iconography alone to show success or failure.
- Provide a route back to sign-in only when it will not abandon a valid pending
  activation unexpectedly.
- Respect reduced motion and preserve layout stability during status changes.
