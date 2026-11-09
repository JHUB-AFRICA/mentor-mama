# Programme Activity

## Purpose

Give Programme Admins a trustworthy, readable record of programme access and
account changes. Activity is derived from the append-only audit trail; it is not a
client-maintained event feed.

## API contract

`GET /api/v1/activity?page=1&page_size=15`

The server returns paginated entries scoped to the signed-in Programme Admin’s
programme. Each entry includes the action, actor, actor role, timestamp, entity
identifier, and safe change metadata. The API does not expose raw secrets or
invitation tokens.

## Interface behavior

- Entries are shown newest first in a compact responsive timeline.
- Action names are translated into plain-language labels.
- Change metadata is collapsed by default and can be expanded per entry.
- Loading, empty, error, and pagination states are explicit.
- The view uses TanStack Query for server-state caching and refetch behavior.
- Loading preserves the timeline geometry with skeleton rows rather than replacing
  the page with a blank or text-only state.
