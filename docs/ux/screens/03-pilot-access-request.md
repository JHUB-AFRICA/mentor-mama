# Screen 03 — Pilot Access Request

**Surface:** `apps/web` public website  
**Purpose:** Let a prospective programme submit an access enquiry without pretending to create an account  
**Primary action:** Send request

## Entry and layout

The screen is reached from `Request Pilot Access` in the public navigation or
home hero. It keeps the public site shell so the visitor does not feel they
have been unexpectedly moved into the secured portal.

```text
PublicSiteShell
├── PublicNavbar
├── RequestIntro
│   ├── PageLabel
│   ├── PageTitle
│   └── ExpectationCopy
├── PilotRequestForm
│   ├── FullNameField
│   ├── WorkEmailField
│   ├── OrganisationField
│   ├── RoleField
│   ├── ProgrammeContextField
│   ├── ConsentNotice
│   └── SendRequestButton
└── PublicFooter
```

On desktop the form is a comfortable single column, approximately 640px wide,
with a short “what happens next” panel alongside it. On mobile the panel moves
below the form; the action remains full-width with a 44px minimum target.

## Form behavior

- Labels are always visible; placeholders do not carry required instructions.
- Work email uses `autocomplete="email"`; names and organisation use appropriate
  autocomplete tokens.
- Role is a select only when the available options are stable and meaningful;
  otherwise use a text field to avoid forcing a visitor into the wrong category.
- The message field accepts enough context to explain the programme need but is
  not presented as a long application.
- Submission is idempotent from the user’s perspective: the button enters a
  stable loading state and prevents duplicate requests.
- The UI does not reveal whether an email already exists in the system.

## States

| State | UI treatment | Next action |
|---|---|---|
| Default | Clear enquiry form and expectation copy | Complete request |
| Field error | Inline message tied to the field | Correct value |
| Submitting | Preserved values and loading button | Wait |
| Success | Dedicated confirmation state with reference guidance | Check email / return home |
| Rate limited | Calm retry message; no technical detail | Retry later or contact support |
| Network failure | Non-destructive error with retry | Retry without losing entries |

## Success state

The confirmation must state that the request was received and that programme
review comes before an invitation. It must not say “account created” or imply
immediate access. Provide a return-home link and a support route without making
the visitor search for help.

## Visual and interaction rules

- Use the existing public brand system: warm mist background, white form
  surface, midnight navy typography, guiding teal for the single primary action.
- Keep the page editorial and spacious; avoid a dense dashboard-like form card.
- Use a restrained submit success transition. Respect reduced-motion preferences.
- No CAPTCHA-style interruption is introduced at this stage unless abuse data
  justifies it; bot protection belongs at the service boundary.

