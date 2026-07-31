# ADR 0011 — Server-side cookie sessions, not stateless JWTs

**Status:** Accepted · **Date:** July 2026 · **Stage:** 6 (§4.1) · **Reverses:** SADD v1.0 §6.4

## Context
AUTH-001 requires scope to be resolved server-side on every request. SADD v1.0 put `facility_id` and
`institution_id` claims in a JWT. A claim is a cached copy of authority: a mentor reassigned to another
facility, or deactivated following a safeguarding concern, retains their old access until the token expires.

## Decision
`httpOnly`, `Secure`, `SameSite=Lax` cookie sessions with server-side state. Scope is resolved per request
from the user row. CSRF is handled by `SameSite=Lax` plus a required `X-Requested-With` header rather than a
CSRF token round-trip.

## Consequences
- Revocation is immediate: delete the session row. This is the deciding property for a safeguarding product.
- Scope is always current, including mid-placement reassignment.
- The credential is unreadable to injected script (`httpOnly`).
- No CSRF token to go stale while a client is offline for hours — the queue drains cleanly on reconnect.
- Horizontal scaling needs a shared session store (Redis, already in the stack).
- A future native app will need a token path — logged as OD-16 rather than pre-built.

## Rejected
**Stateless JWT.** Revocation requires a blocklist, which is a session store with extra steps and worse
failure modes.
