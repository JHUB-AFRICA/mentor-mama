# Screen 02 — Portal Sign In

**Surface:** `apps/portal` auth shell  
**Purpose:** Return an invited/active user to the right protected workspace  
**Primary action:** Sign in

## Layout

```text
Desktop
┌───────────────────────┬─────────────────────────────────────┐
│ quiet product context │                                     │
│ MentorMAMA mark       │              auth form              │
│ short calm message    │        page label + title            │
│                       │        email                         │
│                       │        password                       │
│                       │        Forgot password?              │
│                       │        [Sign in]                      │
└───────────────────────┴─────────────────────────────────────┘

Mobile
┌─────────────────────────────────────┐
│ MentorMAMA mark                      │
│ Portal                               │
│ Sign in to your workspace            │
│ email                                │
│ password                             │
│ Forgot password?                     │
│ [Sign in]                            │
│ Need access? Contact the programme   │
└─────────────────────────────────────┘
```

The form column is never visually cramped. At desktop it is 480–560px wide;
at mobile it uses 24px gutters and a full-width action.

## Component hierarchy

```text
AuthLayout
├── AuthBrandPanel (desktop only)
│   ├── LogoLockup
│   ├── PortalContextLabel
│   └── CalmSupportCopy
└── AuthContent
    ├── PageLabel: Portal
    ├── PageTitle: approved sign-in copy
    ├── IntroCopy
    ├── SignInForm
    │   ├── EmailField
    │   ├── PasswordField
    │   ├── ForgotPasswordLink
    │   └── PrimaryButton
    └── AccessSupportLink
```

## Form behavior

- Labels sit above fields; placeholders are examples only.
- Email uses `autocomplete="email"`.
- Password uses `autocomplete="current-password"`.
- Password visibility toggle is an icon button with an accessible label and a 44px target.
- Submit validates the form locally, then shows a stable loading label without changing button width.
- Enter submits from either field.
- Focus moves to the first invalid field; server errors appear in an alert region above the form and are
  repeated in context where needed.

## State matrix

| State | UI treatment | Next action |
|---|---|---|
| Default | Clean form, one primary CTA | Enter credentials |
| Invalid email | Inline field error | Correct email |
| Missing password | Inline field error | Enter password |
| Submitting | Button loading state, fields preserved | Wait |
| Invalid credentials | Plain-language alert, no account enumeration | Try again or reset password |
| MFA required | Transition to MFA challenge with progress context | Enter TOTP/recovery code |
| Session expired | Alert explains session ended | Sign in again |
| Suspended/deactivated | Dedicated access-status screen | Follow support guidance |
| Network failure | Non-blocking retry message with preserved fields | Retry |

## Visual language

- White auth surface on warm-mist background.
- Midnight navy title and body text; guiding teal only for CTA, focus, and links.
- Full-perimeter border; no decorative card shadow.
- Lucide `Eye`/`EyeOff` only when needed for password visibility.
- Enter transition: opacity + 8px vertical movement, 200–250ms.
- Reduced-motion mode removes the movement but preserves state feedback.

## Accessibility acceptance

- The page has one `h1`.
- Every form control has a programmatic label.
- Error alert uses `role="alert"`; field messages use `aria-describedby`.
- Keyboard focus is visible and never trapped in the page itself.
- Contrast meets WCAG AA.
- Layout remains usable at 320px width and browser zoom/increased text size.
