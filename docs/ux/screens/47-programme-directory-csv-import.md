# Programme directory CSV import

**Status:** Implemented in source; live acceptance pending.

## Entry point

Programme Admins open Programme setup → Directory → Import CSV. The import
card explains the supported record types and file limits. The existing
directory guidance remains available separately.

## User flow

1. Choose institutions, facilities, or wards. Ward imports require one active
   facility selected outside the file; if no active facility exists, the dialog
   explains that one must be added first.
2. Download the matching header-only CSV template and prepare up to 500 rows
   (2 MB maximum). Institutions and facilities accept optional contact person,
   email, and phone columns. Logos are added through the existing edit flow.
3. Preview the file. The server checks UTF-8 CSV structure, required columns,
   field lengths, emails, ward capacity, and possible duplicate names. Row
   numbers and fields are reported without echoing contact values.
4. Correct errors in the file and preview again. Duplicate-name warnings are
   advisory and require explicit acknowledgement.
5. Confirm the import. One file is one atomic operation; all rows commit or
   none do. The command uses an idempotency key, and retries reuse the key.
6. On success, the Directory, Programme setup, and dashboard queries refresh.
   Imported records can be archived individually; there is no batch undo.

## States

- Empty: explains the file type and directs the admin to choose a resource and
  download its template.
- Ward scope missing: explains that an active facility is required.
- Preview: shows row status, issue details, and duplicate acknowledgement.
- Invalid: disables commit and directs the admin to correct the CSV.
- Request failure: retains the file and shows a retryable message.
- Success: reports the created count or explains that an idempotent retry found
  the import already completed.

The API and trust boundaries are documented in
`docs/architecture/directory-import-design.md`.
