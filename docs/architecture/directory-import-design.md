# Programme directory CSV import — architecture plan

**Status:** Implemented in source; runtime acceptance remains pending  
**Owner:** Programme Admin workflow  
**Scope:** Institutions, facilities, and wards; no public partner publishing

## Product contract

- Imports are performed one record type per operation: institutions, facilities,
  or wards. This follows the current directory model: facilities are
  programme-wide, while wards belong to one facility. It avoids guessing
  relationships from names and lets the admin fix parent records before
  importing wards.
- Each file is limited to 500 data rows and 2 MiB. It is parsed in memory and is
  never persisted as an uploaded artifact.
- The admin downloads a type-specific CSV template, uploads a file, reviews a
  server-generated row preview, and confirms warnings before committing.
- Validation errors block commit. Duplicate-name warnings are advisory, matching
  the manual creation rule; valid same-name campuses or branches remain
  importable after explicit confirmation.
- A commit is all-or-nothing for that one file. No partial-success semantics.
  The admin can correct the file and submit again after a failure.
- Ward imports select one active facility in the UI and send its ID as a
  separately scoped field. The CSV cannot choose another programme's facility.
- Logos are excluded from CSV. Contact person, email, and phone columns are
  supported for institutions and facilities. A CSV upload does not grant
  consent to publish partner marks.

## Module shape and ownership

Add `apps.directory_imports` as an application orchestration module. It owns CSV
parsing, row validation, preview freshness, and the import transaction. It does
not own or write directory tables directly:

- institutions are created through `apps.institutions.services.create_institution`;
- facilities are created through `apps.facilities.services.create_facility`;
- wards are created through `apps.placements.services.create_programme_ward`.

The import application is a leaf above those domain modules. No domain module
imports it. Its route is added to the API v1 URL composition root. Existing
single-record endpoints remain the canonical path for manual entry.

## HTTP contract

- `POST /api/v1/directory-imports/{kind}/preview`: multipart `file`; wards also
  require `facility_id`. Returns parsed row outcomes, warnings/errors, counts,
  and a short-lived signed preview token.
- `POST /api/v1/directory-imports/{kind}/commit`: same file and ward scope,
  signed preview token, and warning acknowledgement. Requires the standard
  `Idempotency-Key` command header.
- Supported `kind`: `institutions`, `facilities`, `wards`.
- Success returns kind and created count. A command replay reports that the
  operation already completed; per-record create audits remain owned by each
  domain module, and the batch summary audit stores only type and count.
- Preview tokens bind the actor, programme, resource type, ward facility, file
  digest, the warning/error fingerprint, and a fingerprint of the current
  directory scope. They expire after 15 minutes. Commit reparses and revalidates
  the same bytes. A changed file, expired token, changed preview, or changed
  directory produces a conflict and requires a fresh preview.

## Validation and transaction rules

- Accept UTF-8 and UTF-8 with BOM. Require the exact template header set for the
  selected resource type; reject duplicate/unknown headers, malformed CSV,
  empty names, invalid email, overlong text, invalid phone length, invalid
  positive-integer ward capacity, missing facility scope, and more than 500
  rows.
- Report CSV row numbers using human row numbering (header is row 1). Never echo
  contact values into errors, audit events, or logs.
- Check exact name matches against current programme records and earlier rows
  in the same upload. Return warnings, not hard errors, for possible duplicates.
- Preview has no writes. Commit revalidates under the authenticated programme
  scope and executes domain create services inside one outer
  `transaction.atomic()` plus `IdempotentCommand`. Any row failure rolls back
  all rows, their row audits, coverage invalidation, and the idempotency record.
- The command key makes response-loss retry safe. The client keeps the same key
  for a retry of the same commit and discards it after success or file change.
- Successful row creation uses existing domain services, which audit writes and
  invalidate pilot-coverage attestation. The batch audit contains counts only.

## User experience

Replace the current “Import guidance” placeholder with an import dialog that
provides:

1. resource type and, for wards, active facility selection;
2. a downloadable template for that resource type;
3. file selection and upload limits;
4. an explicit preview state with ready, warning, invalid-row, and failure
   states; errors are attached to row/column, while contacts remain private;
5. a required warning acknowledgement where duplicates are detected;
6. an explicit all-or-nothing import action and success count;
7. a retry path that preserves the selected file and re-previews when the signed
   preview expires or the directory changed.

After success, invalidate the matching directory query, programme setup state,
and dashboard summary. The next manual workflow remains available for correcting
or enriching imported records.

## Operational limits and rollback

This adds no database model or migration. The import application, endpoint,
templates, preview, and commit are implemented in source. Rollback removes the
import app, endpoint, and UI action; imported records remain valid first-class
directory records and can be archived through existing controls. Import is not
undoable as a batch because records may be used immediately after creation. The
UI says that the batch is permanent as a group and that records can be archived
individually.

## Verification contract

- Parser/validation checks: UTF-8/BOM, malformed CSV, size/row cap, header
  contract, row numbering, email/capacity constraints, duplicate warnings.
- Transaction/API checks: scope denial, stale preview, missing warning
  acknowledgement, idempotency replay, complete rollback on one invalid row,
  domain audit and coverage invalidation.
- Portal acceptance: download each template, preview valid/invalid/warning files,
  commit institution/facility/ward samples, verify list counts and setup review
  invalidation, keyboard/modal recovery, and narrow viewport layout.
- Keep browser/build checks gated while Sinaps health reports BLOCKED; record the
  exact environment condition instead of treating missing evidence as a pass.
