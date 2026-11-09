# Screen 15 — Account Status

**Surface:** `apps/portal` protected-entry status route  
**Purpose:** Explain why access is unavailable without exposing unnecessary security detail  
**Primary action:** Follow the appropriate support or sign-in route

## Supported statuses

```text
AccountStatusScreen
├── StatusIcon
├── PageTitle
├── PlainLanguageExplanation
├── NextStepPanel
└── SecondaryActions
    ├── ContactSupport
    ├── ReturnToSignIn
    └── ReturnToPublicSite
```

Use tailored copy for pending invitation, expired invitation, suspended,
deactivated, and revoked access. The user should understand what they can do
next, but the page must not reveal private administrative notes or imply a
technical failure when the account is intentionally restricted.

## Rules

- Do not expose whether another person requested or caused a status change
  unless policy explicitly allows that communication.
- Never show a blank dashboard or an unexplained redirect.
- If a session is revoked, clear protected navigation state before showing this
  screen.
- For an expired or replaced invitation, ask the user to request a new link from
  their programme team. For paused or inactive access, point them to their
  programme administrator or programme support for the next step.
- Preserve a safe support reference where one exists, without exposing internal
  identifiers or tokens.

## Responsive and accessibility rules

- Use one clear heading and a short explanation before any action.
- Status is conveyed through text, icon, and colour together.
- Keep support as a visible text action with a 44px target on mobile.
- Avoid auto-redirect loops; navigation requires a visible user action except
  where a short, announced transition is essential.

