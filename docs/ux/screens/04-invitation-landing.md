# Screen 04 — Invitation Landing

**Surface:** `apps/portal` invitation entry route  
**Purpose:** Establish why the visitor is here, what access they are accepting,
and whether the invitation can still be used  
**Primary action:** Create account

## Valid invitation layout

```text
AuthLayout
├── AuthBrandPanel (desktop only)
└── AuthContent
    ├── InvitationBadge
    ├── PageTitle
    ├── InvitationSummary
    │   ├── InvitedEmail (read-only)
    │   ├── ProgrammeName
    │   ├── AssignedRole
    │   └── ExpiryNotice
    ├── AccountExpectation
    ├── CreateAccountButton
    └── SupportLink
```

The page must make the invitation scope understandable without exposing
internal identifiers. The invited email is shown as read-only context; the
visitor should not be asked to retype it or select a role that was already
assigned by an authorised programme administrator.

## Valid invitation behavior

- `Create account` routes to the activation form with the signed invitation
  context preserved.
- If the visitor already has an active account, offer sign-in and explain that
  accepting may require an authenticated session.
- If the invitation belongs to a different email than the current signed-in
  account, stop before activation and provide a safe recovery/support route.
- Never reveal the raw invitation token in visible copy or analytics payloads.

## Invalid and lifecycle states

| State | UI treatment | Primary next action |
|---|---|---|
| Valid | Programme, role, invited email, expiry, create action | Create account |
| Expired | Explain that the link is no longer valid | Contact programme support |
| Already used | Explain that setup was completed or started | Sign in |
| Revoked | Explain that access is no longer available | Contact programme support |
| Malformed/unknown | Neutral unavailable-invitation message | Return to portal / support |
| Loading | Skeleton-like reserved layout, no layout jump | Wait |
| Network failure | Retry message preserving the route | Retry |

The invalid states are intentionally specific enough to guide the user but do
not disclose sensitive account or programme details beyond what the token
already authorises.

## Visual and accessibility rules

- Use a calm confirmation-oriented composition, not a marketing page or dense
  card stack.
- On desktop, use the shared authentication brand panel and journey artwork;
  on mobile, preserve only the compact brand header and task content.
- Use the shared CSS dot-grid and wavy-surface primitives rather than adding
  screen-specific background images.
- Keep vertical spacing compact and intentional: status, title, explanation,
  invitation summary, CTA, and sign-in support should read as one sequence.
- The invitation summary has a clear heading and definition-list semantics for
  programme, role, email, and expiry.
- The primary action is visually dominant; support and sign-in are secondary
  links.
- Status messaging uses a live region where it changes after load and remains
  readable at 320px width and increased browser text size.
- Use Lucide status icons with text; never communicate validity by colour alone.
- Entering activation uses a short opacity transition only when motion is
  allowed.
