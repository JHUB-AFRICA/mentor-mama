# Programme directory

## Purpose

Programme Admins configure the university and hospital context that later
placement workflows will use.

## Current slice

- List active institutions and facilities for the current programme.
- Add an institution with its name and optional context fields.
- Add a facility with its name and optional context fields.
- Keep the directory inside Programme Settings, separate from personal account
  security settings.

## Authorization and architecture

The institutions and facilities modules own their serializers, services, views,
and URLs. The authenticated Programme Admin is the only actor permitted to create
or list records in this first configuration slice, and the programme scope is
resolved from the session rather than request data. Creates are audited.

Wards, editing/archive controls, and role-specific directory permissions remain
the next configuration slice.
