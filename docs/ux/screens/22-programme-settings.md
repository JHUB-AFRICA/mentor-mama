# Programme settings

## Purpose

Programme Admins can maintain the programme identity used across the portal and
programme communications. Account security remains in the separate account
settings surface.

## API contract

- `GET /api/v1/programme/settings`
- `PATCH /api/v1/programme/settings` with `{ "name": "..." }`

Only an active Programme Admin can read or change the programme name. Changes are
written through the identity service and recorded in the append-only audit trail.

## Interface behavior

- Programme Settings opens from the fixed sidebar Settings item.
- Account and security settings remain under the signed-in user control.
- Loading uses skeleton content; saving uses the shared blocking loading overlay.
- Success is shown in-context and failures preserve the entered value.
