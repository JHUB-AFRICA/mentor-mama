# Screen 05 — Account Activation

**Surface:** `apps/portal` invitation activation route  
**Purpose:** Let an invited person create secure credentials while preserving the authorised invitation context  
**Primary action:** Create account

## Component hierarchy

```text
AuthLayout
├── AuthBrandPanel (desktop only)
└── AuthContent
    ├── StepIndicator: Invitation accepted → Create account → Secure account
    ├── PageTitle
    ├── ActivationContext
    │   ├── InvitedEmail (read-only)
    │   ├── ProgrammeName
    │   └── AssignedRole
    ├── ActivationForm
    │   ├── FullNameField
    │   ├── PasswordField
    │   ├── ConfirmPasswordField
    │   ├── PasswordRequirements
    │   └── CreateAccountButton
    └── SupportLink
```

The invited email, programme, and role are context—not editable profile fields
on this screen. Name is collected only if it is not already present in the
invitation record.

## Password guidance

- Show requirements before submission and update them as the user types.
- Use a passphrase-friendly 12-character minimum and common-password screening
  rather than forcing arbitrary number/symbol composition rules.
- The password visibility control is a labelled 44px icon button.
- Confirm-password errors are shown only after the field is touched or submit
  is attempted.
- Do not display or log the password, token, or raw validation payload.

## States

| State | UI treatment | Next action |
|---|---|---|
| Default | Context summary and empty form | Enter details |
| Password incomplete | Requirement checklist identifies remaining rules | Improve password |
| Password mismatch | Inline confirmation error | Correct confirmation |
| Submitting | Stable loading button; preserve values except password if policy requires | Wait |
| Invitation expired/revoked | Replace form with invitation status screen | Contact support |
| Email already active | Explain that activation is unnecessary | Sign in |
| Network/server failure | Non-technical retry message | Retry |

On successful submission, move to email verification with a clear transition
message. Do not silently sign the user into a partial account.

## Responsive and accessibility rules

- Use one `h1`, visible labels, and field-level descriptions.
- Password requirements are grouped with a programmatic relationship to the
  password field.
- Focus moves to the first invalid field; server errors use an alert region.
- At 375px and below, the step indicator becomes a compact “Step 2 of 3”
  treatment rather than wrapping into a crowded horizontal row.
