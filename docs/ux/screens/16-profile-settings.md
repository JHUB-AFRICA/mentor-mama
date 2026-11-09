# Screen 16 — Profile Settings

**Surface:** `apps/portal` authenticated profile route  
**Purpose:** Let a user review and update permitted personal and contact information  
**Primary action:** Save changes

## Component hierarchy

```text
PortalShell
├── Sidebar / MobileNavigation
└── SettingsContent
    ├── Breadcrumbs
    ├── PageTitle: Profile
    ├── IdentitySection
    │   ├── FullNameField
    │   ├── EmailReadOnlyField
    │   └── RoleAndProgrammeSummary
    ├── ContactSection
    │   └── PhoneNumberField (profile/contact data only)
    ├── SaveChangesButton
    └── AccountActionsLink
```

Phone numbers are treated as profile and contact data at this stage. The UI
must not label a phone number as an MFA or recovery method until that capability
is deliberately introduced and secured end to end.

## Behavior

- Email and role are read-only here when changes require an administrative
  workflow.
- Dirty state is visible; navigating away with unsaved edits prompts only when
  the browser supports it safely.
- Success appears inline near the section and through a brief toast.
- Validation errors remain attached to the relevant field and preserve valid
  entries.

## Accessibility and responsive rules

- Use section headings, visible labels, and appropriate autocomplete metadata.
- Keep the profile form spacious rather than compressing it into a settings
  table.
- On mobile, stack sections and place the save action after the edited fields.
- Any role or programme information is presented as descriptive context, not as
  an editable control.

