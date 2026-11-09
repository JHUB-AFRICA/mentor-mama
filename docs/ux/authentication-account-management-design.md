# MentorMAMA Authentication & Account Management UX Blueprint

**Stage:** UX planning — no implementation approval implied  
**Product:** MentorMAMA portal  
**Audience:** Students, clinical mentors, nurse managers, university coordinators, and Programme Administrators  
**Primary context:** A calm, mobile-first healthcare workflow with occasional desktop administration

## 1. Design outcome

The account journey should feel like a guided handoff, not an obstacle course:

1. The user knows why they are here.
2. The next action is obvious.
3. Security requirements are explained in plain language.
4. Every submitted action gives immediate feedback.
5. Recovery never exposes secrets to administrators or leaves the user guessing.

The interface is spacious and deliberate. It should not look like a generic SaaS
template, an admin console, or an AI-generated collection of cards.

## 2. Brand direction

MentorMAMA inherits the Sinaps Technology design discipline and the existing
MentorMAMA brand guide:

| Token | Value | Use |
|---|---|---|
| Midnight navy | `#0D1B33` | Headings, primary text, primary actions |
| White | `#FFFFFF` | Primary canvas and form surfaces |
| Warm mist | `#F4F7F8` | Page background and quiet grouping |
| Guiding teal | `#1D8C8C` | Progress, links, focus, positive emphasis |
| Soft stone | `#E4E8EE` | Borders, dividers, disabled surfaces |
| Muted terracotta | `#D97757` | Warnings and one deliberate alert emphasis |

The generated UI/UX reference system is useful for pattern comparison, but its
cyan/green palette and Figtree/Noto pairing do not override the approved
MentorMAMA brand guide. The product uses Manrope for headings and Inter for
body/UI text unless the brand owner approves a change.

### Visual rules

- No gradients, glassmorphism, decorative shadows, emoji icons, or oversized cards.
- Use Lucide's outline icon family at a consistent 1.75px stroke.
- Use an 8px spacing rhythm, with 24px standard card padding and 8–12px radii.
- Form labels remain visible above fields; placeholders never replace labels.
- One primary action per screen; secondary actions remain visually quiet.
- The desktop layout may use a restrained brand/context panel, but mobile becomes
  a single focused column.

## 3. Complete end-to-end user flows

### 3.1 Invitation → account creation → first access

1. **Invitation email received**
   - Subject and sender identify MentorMAMA and the inviting programme.
   - Primary CTA: `Accept invitation`.
   - Supporting copy states the role and organisation context without exposing sensitive data.
   - Secondary link: `This invitation was not expected` → support/contact guidance.

2. **Invitation landing**
   - States: valid, expired, already used, invalid, loading.
   - Valid state shows the invited email, role, organisation, and expiry date.
   - The email is not editable; the user must activate the address that received the invitation.
   - Primary CTA: `Create my account`.

3. **Create account**
   - Step 1: confirm first name, last name, phone/contact number, and password.
   - Phone is profile/contact data only; copy must not imply text-message sign-in or recovery.
   - Password requirements appear before typing and become checks as the user types.
   - Password and confirmation fields support show/hide controls with accessible labels.

4. **Email verification / activation confirmation**
   - In the current backend, the invitation link is the mailbox proof and account activation event.
   - UX should call this `Email confirmed` after successful link validation, rather than adding a
     duplicate verification step.
   - If a separate verified-email requirement is later approved, add an explicit `email_verified_at`
     state and flow rather than pretending the existing link has two meanings.

5. **First-access handoff**
   - Optional roles go to the workspace.
   - Programme Admin, Coordinator, and Nurse Manager connect an authenticator app before product access.
   - A progress indicator reads: `Account created → Protect your account → Workspace`.

### 3.2 Required authenticator setup

1. Explain in plain language that an authenticator app adds a sign-in check.
2. Show the MentorMAMA-branded QR code. “Can’t scan?” reveals the private setup key.
3. Show a six-digit code field with `one-time-code` input semantics.
4. Verify the code; preserve the entered context if verification fails.
5. Show an “Authenticator connected” success state, then show backup codes once.
6. Explain that each backup code works once and require the user to confirm they saved the codes.
7. Never put backup codes in a toast, URL, email, audit event, or ordinary profile response.

### 3.3 Login

1. Email and password form.
2. Invalid credentials show one safe message: `We couldn't sign you in with those details.`
3. Successful ordinary login opens the workspace.
4. Privileged login opens either:
   - `Set up your authenticator app`, or
   - `Enter your sign-in code`.
5. A backup-code link is clearly labelled `Use a backup code`; each code works once.
6. If the user has no authenticator or backup code, direct them to their programme administrator.
7. Successful verification returns the user to the intended destination.
7. Suspended/deactivated accounts show a calm access-status screen with support guidance,
   never a technical error or role disclosure.

### 3.4 Password reset

1. `Forgot password?` opens a focused email form.
2. Always show the same accepted result whether the email exists or not:
   `If an account matches that address, we'll send reset instructions.`
3. Reset email opens a valid, expired, used, or invalid-link state.
4. New password form repeats the same password rules as activation.
5. Success says: `Your password has been changed. Other signed-in devices were signed out.`
6. Primary action: `Return to sign in`.

### 3.5 Authenticated password change

1. Account → Security → Change password.
2. Current password, new password, confirmation.
3. Inline validation; submit remains disabled only when the form is genuinely invalid.
4. Confirmation modal is not needed for a normal change; the security consequence is stated near the CTA.
5. Success toast plus inline confirmation; other sessions are revoked while the current session remains.

### 3.6 Profile and contact management

1. Account → Profile.
2. Editable: first name, last name, phone/contact number.
3. Read-only context: email, role, programme, institution/facility scope.
4. Email change is not part of the first UI slice until a verified-email change endpoint exists.
5. Save uses an inline success message and a short success toast; errors stay next to the field.

### 3.7 Session and device management

1. Account → Security → Where you’re signed in.
2. Each row shows device label, last seen, approximate IP, expiry, and `This device` marker.
3. Revoke one session immediately with a toast; no confirmation modal is needed because it is reversible by signing in again.
4. `Sign out all other devices` uses a confirmation modal on desktop and a bottom sheet on mobile.
5. Current session cannot be revoked from the list; use `Sign out` instead.

### 3.8 Account status and authenticator recovery

1. An authorised manager opens a scoped user record.
2. Status changes use a confirmation modal only for suspension/deactivation.
3. The modal requires a reason and clearly states the access consequence.
4. Programme Admin authenticator recovery requires a reason and explains that the user must set it up again.
5. Admins never see, copy, or enter the target's password, setup key, or backup codes.

## 4. Screen inventory

### Public/auth screens

- `InvitationLandingPage`
- `AccountActivationPage`
- `AccountActivationResult`
- `SignInPage`
- `MfaSetupPage`
- `MfaChallengePage`
- `RecoveryCodesPage`
- `ForgotPasswordPage`
- `PasswordResetPage`
- `PasswordResetResult`
- `AccessStatusPage`

### Authenticated account screens

- `ProfilePage`
- `SecurityOverviewPage`
- `ChangePasswordPage`
- `SessionsPage`
- `MfaDevicesPage`
- `AccountStatusModal`
- `MfaRecoveryModal`

## 5. Component hierarchy

```text
AppShell
├── AuthLayout
│   ├── BrandMark
│   ├── AuthContextPanel (desktop only)
│   └── AuthContent
│       ├── PageLabel
│       ├── PageTitle
│       ├── IntroCopy
│       ├── FormStack
│       │   ├── FieldLabel
│       │   ├── TextField / PasswordField / OtpField
│       │   ├── FieldHint / FieldError
│       │   └── FormActions
│       ├── InlineNotice
│       └── SecondaryLinks
├── PortalShell
│   ├── DesktopSidebar / MobileTopBar
│   ├── Breadcrumbs or PageContext
│   ├── PageHeader
│   └── PageContent
└── GlobalFeedback
    ├── Toaster
    ├── Modal / ConfirmDialog
    ├── BottomSheet (mobile)
    └── SessionExpiryBanner
```

## 6. Component states and feedback

Every form and data view must define: default, focused, filled, invalid,
submitting, success, empty, loading, expired, forbidden, and network-error states.

| Situation | Feedback |
|---|---|
| Field validation | Inline message directly below the field |
| Submit in progress | Button label changes; width does not shift |
| Successful non-navigation action | Inline confirmation plus optional toast |
| Global session revoked/expired | Persistent banner with `Sign in again` |
| Destructive status action | Modal/bottom sheet with required reason |
| Background refresh failure | Non-blocking toast with retry action |
| Backup codes | Dedicated page/state with a save confirmation, never toast-only |

Toasts use Sonner, bottom-right on desktop and bottom-center above the safe area
on mobile. Auto-dismiss after four seconds for success/info; errors remain until
dismissed or acted upon. Toasts never replace field-level errors.

## 7. Responsive behavior

- Design first at 375px, then validate 480px, 768px, 1024px, and 1440px.
- Mobile: single column, 24px page gutters, primary CTA full-width, minimum 44px targets.
- Tablet: single content column with wider gutters; no premature dashboard density.
- Desktop: auth form max-width 480–560px with an optional quiet context panel; account settings
  use a 240px navigation rail and content max-width 960px.
- Modals become bottom sheets below 640px. No horizontal scrolling.
- Text remains readable at increased browser font size; buttons and notices may wrap.
- Respect `prefers-reduced-motion`; motion is a 150–300ms spatial transition, never decoration.

## 8. Accessibility requirements

- WCAG 2.2 AA target.
- Visible keyboard focus; never remove the focus indicator without an equivalent replacement.
- Inputs have labels, `aria-describedby` hints/errors, and appropriate autocomplete tokens.
- OTP uses `inputMode="numeric"`, `autoComplete="one-time-code"`, and a clear accessible label.
- Error copy identifies what happened and what to do next.
- Never communicate status through color alone.
- Focus moves to the page title or first error after route/state changes.
- Live-region announcements are reserved for success/error feedback that is not otherwise visible.

## 9. Backend/UI contract gaps to resolve before implementation

1. Invitation activation UI needs a backend resend-invitation endpoint or explicit admin-support fallback.
2. Password reset UI is ready for the existing backend endpoints.
3. Profile editing needs a profile update endpoint; the current backend exposes identity but not update transport.
4. Email change/verification needs an explicit product decision and verified-email field before design implementation.
5. Account-status UI needs a scoped user list/detail endpoint for managers.
6. The MFA setup QR displays the MentorMAMA icon with high error correction; third-party app icons remain controlled by those apps.

## 10. Acceptance criteria for the design

- A first-time user can explain the next step on every screen without instruction.
- A user can complete invitation activation and connect an authenticator without seeing technical terms.
- Every failure state preserves context and gives one useful next action.
- No password, TOTP secret, or recovery code is shown to an administrator.
- The design remains calm, spacious, and recognisably MentorMAMA at 375px and 1440px.
- The same components support all five roles without role-specific visual duplication.
