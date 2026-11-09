# Programme dashboard summary

## API contract

`GET /api/v1/dashboard/summary`

The endpoint returns programme-scoped counts for total people, active accounts,
pending invitations, suspended accounts, and recorded audit events. It is intentionally smaller than
the People and Activity list endpoints so the overview can refresh quickly.

## Interface behavior

- Overview cards use live server values rather than placeholder copy.
- Counts use layout-preserving skeletons while the summary loads.
- The Activity card displays the recorded audit-event count, not an account count.
- A failed summary request exposes an inline retry action while preserving the
  dashboard layout.
- The existing People and Activity pages remain the source of detailed records.
- The summary is cached briefly with TanStack Query and refreshed independently
  from the authenticated workspace bootstrap.
