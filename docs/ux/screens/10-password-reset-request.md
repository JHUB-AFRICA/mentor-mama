# Screen 10 — Password Reset Request

**Surface:** `apps/portal` public auth route  
**Purpose:** Start password recovery without revealing whether an account exists  
**Primary action:** Send reset instructions

## Layout

```text
AuthLayout
├── AuthBrandPanel (desktop only)
└── AuthContent
    ├── BackToSignInLink
    ├── PageTitle
    ├── Explanation
    ├── ResetRequestForm
    │   ├── EmailField
    │   └── SendInstructionsButton
    └── SupportLink
```

The form is intentionally short. The same confirmation state is shown whether
the address is known, unknown, inactive, or rate-limited, preventing account
enumeration through visible behavior.

## States

| State | UI treatment | Next action |
|---|---|---|
| Default | Email field and one primary action | Submit address |
| Invalid email | Inline field error | Correct address |
| Submitting | Loading button with preserved email | Wait |
| Accepted | Neutral confirmation and delivery guidance | Check email |
| Rate limited | Same neutral confirmation with retry timing if safe | Wait |
| Network failure | Retry message without changing the address | Retry |
| Recovery service unavailable | Plain-language temporary outage message; preserve the email | Try again shortly |

The accepted state should advise checking spam/junk folders and explain that
the link expires. It must not say “we found your account” or “no account
exists.”

## Accessibility and visual rules

- The email field uses `autocomplete="email"` and has a visible label.
- Focus moves to the confirmation heading after a successful submission.
- Use a calm single-column composition consistent with sign-in.
- The back link returns to sign-in without losing the user’s place in the flow.
- Infrastructure failures are logged server-side and exposed to the user as a
  safe `503` recovery message; database, email, and outbox details never appear
  in the interface.
