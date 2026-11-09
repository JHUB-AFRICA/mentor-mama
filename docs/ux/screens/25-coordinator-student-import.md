# Coordinator student import

## Purpose

University Coordinators onboard students belonging to their institution without asking a Programme Admin to repeat a student-by-student invitation task.

## Flow

1. A Programme Admin creates an institution and invites a University Coordinator with that institution selected.
2. The Coordinator opens **Students** in the institution workspace.
3. The Coordinator downloads the CSV template and fills in `email`, `first_name`, `last_name`, `registration_number`, and optional `phone`.
4. The Coordinator uploads the CSV. The browser reads the file locally and shows the row count.
5. **Review student list** sends a dry-run validation request. No invitations are sent during preview.
6. The review table shows ready rows and rejected rows with row numbers and actionable messages.
7. The Coordinator confirms **Send invitations**. Valid rows are linked to the Coordinator’s institution and invitation emails are queued.

## Rules

- CSV and XLSX files are supported; the first worksheet is read in the browser.
- Maximum upload size is 500 student rows per command.
- Students are always created with the Coordinator’s institution scope; institution IDs are never accepted from the file.
- `registration_number` is required and unique within the institution. Values are normalized to uppercase for matching.
- Phone is optional contact data and is not used as a login identifier.
- Course, year of study, date of birth, and emergency-contact details are
  completed by the student after activation, not collected in this roster.
- Duplicate emails in the same file are rejected.
- Existing active accounts, existing invitations, and accounts belonging to another programme are not silently overwritten.
- The preview is safe to repeat. The send command only processes rows that were valid during that request.

## States

- Empty: explain the required columns and provide the template download.
- Parsing error: identify missing headers or row-limit violations before contacting the API.
- Preview: show row-level ready/rejected results; no email has been sent.
- Sending: disable the confirmation action and show progress copy.
- Complete: report invitation count and preserve rejected-row explanations.

## Security boundary

The UI is only a convenience. The API permits this command only for an active University Coordinator with an institution scope. The server derives the institution from the authenticated coordinator and re-validates it before every invitation.
