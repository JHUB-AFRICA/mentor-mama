# MentorMAMA Public Website → Portal Experience Map

**Status:** UX planning  
**Scope:** The experience from first public visit through authenticated portal use

## 1. Product boundary

MentorMAMA has two connected experiences:

```text
Public website                         Authenticated portal
www.mentormama...                      app.mentormama...
Learn → trust → request access         Activate → protect → work
```

They share the same brand, but they should not look like the same screen with
the navigation swapped. The public site is editorial and explanatory. The
portal is operational and task-oriented.

### Recommended local/production origins

| Experience | Local | Production intent |
|---|---|---|
| Public website | `apps/web` Vite origin | `www.mentormama...` |
| Portal | `apps/portal` Vite origin | `app.mentormama...` |
| Backend/API | Django origin | `api.mentormama...` |

Invitation and password-reset links must use the portal origin. The current
`FRONTEND_BASE_URL` should therefore represent the portal origin, not the
marketing site origin.

## 2. What an anonymous visitor sees

### Entry: public home

The visitor sees:

1. A clear statement of the mentorship problem.
2. The practical product loop: setup → train → onboard → support → track.
3. Role-relevant explanation for mentors, managers/coordinators, and students.
4. One dominant CTA: `Request Pilot Access`.
5. A discreet secondary destination: `Portal sign in` for already-invited users.

The visitor should not see a login form embedded inside the marketing page. That
mixes the institutional decision journey with the working-user journey.

### Public navigation model

Desktop:

```text
[MentorMAMA]  About  How It Works  Resources  Community  Contact   [Portal sign in]
                                                                    [Request Pilot Access]
```

Mobile:

```text
[MentorMAMA]                                      [Menu]
Menu → Portal sign in / Request Pilot Access / public pages
```

The primary public CTA remains `Request Pilot Access`. `Portal sign in` is a
quiet secondary action for people who already have an invitation.

## 3. Public access-request flow

```text
Home
  ↓ Request Pilot Access
Contact / pilot enquiry
  ↓ Submit
Request received confirmation
  ↓ optional
Return to public site / Contact the team
  ↓ internal review and invitation
Invitation email
```

### Request Pilot Access screen

The form should ask only for information needed to decide whether to contact
the requester:

- Name
- Work email
- Institution/facility
- Role or interest
- Short message

It is not an account-creation form. The success state must say that the request
has been received and must not imply that an account already exists.

### Public-to-portal transition

The visitor crosses into the portal only when one of these is true:

- they select `Portal sign in`;
- they open an invitation link;
- they open a password-reset link.

The transition changes the shell, page title, navigation, and security posture.
It should feel intentional, with the MentorMAMA mark and a short context line,
not like a broken redirect.

## 4. Portal entry flows

### 4.1 Invited user

```text
Invitation email
  ↓ Accept invitation
Invitation landing: valid / expired / used / invalid
  ↓ Create my account
Account activation
  ↓ Submit
Email confirmed + account created
  ↓ if privileged role
MFA setup → recovery codes → workspace
  ↓ otherwise
Workspace
```

### 4.2 Returning user

```text
Portal sign in
  ↓ valid password
Workspace                         optional-role user
  or
MFA challenge → Workspace         required-MFA user
  or
Access status                     suspended/deactivated user
```

### 4.3 User recovering access

```text
Portal sign in
  ↓ Forgot password?
Reset request
  ↓ same response for known/unknown email
Reset email
  ↓ link
New password: valid / expired / used / invalid
  ↓ success
Sign in again → MFA if required → Workspace
```

### 4.4 MFA recovery

```text
MFA challenge
  ↓ Use a recovery code
Verified workspace
  or
No access to authenticator
  ↓ contact support / Programme Admin
Audited admin recovery
  ↓ next login
Fresh MFA setup → recovery codes → workspace
```

## 5. Shells and screen templates

### Public shell

- Editorial layout with generous section spacing.
- Public navigation and footer.
- Large imagery only where it carries product meaning.
- Gentle scroll reveals; no animation required to understand the content.

### Auth shell

- No public footer and no full public navigation.
- MentorMAMA mark, `Portal` context, and support link.
- Desktop: form column plus quiet context panel.
- Mobile: one column, 24px gutters, full-width primary CTA.
- Auth content max-width: 480–560px.

### Portal shell

- Role/capability-derived navigation.
- Persistent account/security access.
- Desktop left rail; mobile bottom navigation with four or fewer primary destinations.
- The first page after authentication answers: `What needs my attention now?`

## 6. Screen-by-screen design order

We should design and approve screens in this order:

1. **Public home handoff** — CTA hierarchy and portal sign-in placement.
2. **Pilot access request** — form, validation, success state.
3. **Portal sign in** — default, invalid credentials, loading, suspended, expired session.
4. **Invitation landing** — valid, expired, used, invalid.
5. **Account activation** — profile confirmation and password creation.
6. **Email confirmed result** — successful activation handoff.
7. **MFA setup** — QR/manual key, code validation, help text.
8. **Recovery codes** — one-time display, copy/download, acknowledgement.
9. **MFA challenge** — TOTP, recovery code, invalid code, rate limit.
10. **Forgot password** — neutral accepted response.
11. **Password reset** — valid/expired/used link states.
12. **Portal workspace landing** — role/capability-based first view.
13. **Account overview/profile** — editable contact data and read-only role scope.
14. **Security overview** — password, MFA devices, sessions.
15. **Session management** — current session, revoke one, revoke others.
16. **Account status management** — scoped admin list, detail, confirm modal.
17. **MFA recovery modal** — reason, consequence, success, audit-safe copy.

Each screen is designed in default, loading, empty, error, forbidden, success,
expired, and reduced-motion states before it is implemented.

## 7. Shared transition language

Every boundary uses the same language:

- Public → portal: `Open the MentorMAMA portal`.
- Invitation → account: `Create my account`.
- Account → protection: `Protect your account`.
- Protection → work: `Continue to workspace`.
- Recovery → return: `Return to sign in`.

No route should leave the user at a blank loading screen. The destination must
show its context immediately, then hydrate its data.

## 8. Inspiration guardrails

We can study editorial healthcare, university, and professional SaaS products
for rhythm, information hierarchy, and interaction patterns. We should borrow
principles—not copy Pinterest layouts, illustrations, screenshots, or brand
assets. The MentorMAMA result must remain grounded in its approved navy, mist,
teal, Manrope/Inter typography, clinical context, and plain voice.

## 9. First design review checkpoint

Before implementation begins, approve these three decisions:

1. Whether production uses separate `www`, `app`, and `api` subdomains.
2. Whether `Portal sign in` is visible in the public header or only in the footer/contact flow.
3. Whether the first design review starts with the public handoff or the portal sign-in screen.
