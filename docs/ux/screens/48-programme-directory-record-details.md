# Programme directory record details

**Status:** Implemented; authenticated local browser acceptance passed for institution, facility, and ward detail views, stable URLs, facility-to-ward navigation, contact/logo reads, archive flows, and 375 px keyboard behavior. A direct below-occupancy capacity rejection journey remains pending.

## Design brief

- **User and job:** Programme Administrator reviewing or maintaining an
  institution, facility, or ward in the programme's operating directory.
- **Primary outcome:** Understand what the record represents, its contact and
  operational details, its current status, and what records depend on it; then
  edit/archive it or navigate to a related directory record.
- **Evidence:** The supplied Directory screenshot shows the institution table
  clipped at the action column, abbreviated IDs, and several cells that only
  say “Not specified” or “Not added.” Existing code already stores the
  institution/facility contact and logo fields and ward capacity/occupancy data,
  but has no dedicated detail screen or view-details link.
- **Inherited visual language:** MentorMAMA's navy and teal palette, Nunito Sans
  and display type pairing, Lucide icons, rounded white surfaces, existing
  `programme-admin.css` patterns, and scoped list/write API contracts.
- **Adapted interaction:** Use a URL-addressable detail screen within Programme
  setup, with query parameters for record type and ID. Preserve Directory as
  the parent context, provide an explicit return action, and let browser Back
  return to the list. Existing edit and archive flows stay authoritative.
- **Proposed composition:** A quiet breadcrumb/back line; a record identity
  header with status and direct actions; a two-column content area grouping
  details/contact and related operating records. On narrow screens the content
  becomes one column, related lists remain readable, and no horizontal table
  scrolling is required on the details screen.

## Record content

- **Institution:** name, logo when present, type, county/location, active or
  inactive/archived status, contact person, email, and phone.
- **Facility:** name, logo when present, level, county/location, maternity unit,
  status, contact details, and wards in this facility with their capacity and
  occupancy. Facilities remain programme-wide; do not imply institution
  ownership.
- **Ward:** name, active/archive state, facility link, shift pattern, hard
  student capacity, occupying placements, and remaining slots. Explain that
  occupancy is placement-owned and that an archived parent facility blocks
  operational use.
- Missing optional information is grouped into one helpful empty state with an
  Edit action, rather than repeated “Not specified” labels.
- Contact actions use `mailto:` and `tel:` only when those values exist.
  Logos remain programme-directory assets; this screen does not publish them.

## State and recovery contract

- Loading: retain the page structure and show record-shaped skeletons.
- Error: name which record details could not load and offer a retry.
- Missing/removed ID: explain that the record is unavailable and return to the
  directory without exposing another programme's record.
- Empty related wards: explain no wards are registered at this facility and
  provide the existing Add ward action pre-scoped to that facility.
- Edit: opens the existing update form; success refreshes detail and list data.
- Archive/restore institution or facility: existing confirmation and API flow;
  preserve the detail URL and refresh status/related records after completion.
- Ward edit/enable/disable: existing ward update API and capacity safeguards;
  preserve detail URL and refresh occupancy/status. Do not offer ward
  restoration when the parent facility remains archived.
- Browser Back from a list-opened detail returns to the list; direct-link
  back-to-directory clears only the record parameters.

## Acceptance evidence

1. Each institution/facility list row and ward row has a visible, keyboard
   reachable “View details” action.
2. Details open at a stable URL that can be refreshed or shared within the
   authenticated programme workspace.
3. Institution, facility, and ward fields above render from existing query data;
   contacts are not fabricated and missing optional values are handled cleanly.
4. Facility ward links navigate to the correct ward details and back-navigation
   restores the facility details.
5. Edit, archive/restore, ward capacity edit, and ward enable/disable continue
   to use the existing APIs and refresh the current detail state.
6. A 375 px viewport has no page-level horizontal overflow; all primary actions
   remain visible and operable by keyboard.
7. Loading, error/retry, unavailable-record, and empty-related-wards states are
   present.

No new endpoint, data field, third-party UI package, or database migration is
required; current scoped directory queries provide the visible fields.
