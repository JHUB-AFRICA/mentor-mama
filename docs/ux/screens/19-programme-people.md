# Programme People

## Purpose

Give Programme Admins a clear, searchable view of people belonging to their
programme. The table is a working access-management surface, not a reporting
export.

## API contract

`GET /api/v1/people?page=1&page_size=10&search=&role=&status=`

The server owns filtering, ordering, and pagination. The response contains
`results` plus `pagination` metadata: current page, page size, total count, total
pages, and next/previous flags. Page size is bounded by the API at 50 records.
Only an active Programme Admin may read people in their own programme.

## Interface behavior

- Search applies by name or email and resets to page one.
- Role and status filters are server-side and reset to page one.
- The table remains horizontally scrollable on small screens without breaking the
  surrounding page.
- Loading, empty, and failed-request states are explicit.
- Invited accounts expose a resend action; active accounts expose suspend and
  deactivate actions; suspended/deactivated accounts expose activate. Destructive
  changes require a branded confirmation dialog and all actions return a visible
  result message.
- Selecting a person opens a responsive details drawer with their contact data,
  role, status, and programme join date without losing the table context.
- TanStack Query handles server-state caching, request deduplication, and a short
  stale window; the table itself remains a small branded component because the
  current requirements do not justify a heavy data-grid dependency.
