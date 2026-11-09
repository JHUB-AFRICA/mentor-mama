# Student flow 04 — placement signing, close-out gates, and shared styles

## Acceptance journey

1. Open an assignment awaiting acknowledgement, review the full document, and
   continue to the sign step.
2. Confirm that the signed-in Student can type their name, sees that the date is
   automatic, and cannot sign using a different account name.
3. Sign once. Verify the server records the typed name and signing time, moves
   the placement to Orientation in the same command, and returns a success
   message.
4. Reopen the assignment. Verify the signature and date are visible and no
   edit or resubmission control is available.
   For a legacy placement already in Orientation without a record, verify the
   Student can sign now and the record uses the current signing date.
5. Open an old placement still in Orientation after its planned end date.
   Verify the final assessment remains unavailable. For Active or Paused
   placements, verify the assessment appears only after the effective end date.
6. Open Library and Account Settings as a Student. Verify the established
   MentorMAMA styling loads, and repeat at desktop and mobile widths.

## Source findings and changes

- Final assessment status previously used only the end date. It now requires an
  Active or Paused lifecycle state, both in the server status and write guard;
  the Student UI also gates the form by lifecycle state.
- Placement acknowledgement previously accepted only a checkbox and did not
  persist name/date fields. It now requires the account name, creates a
  one-per-placement record with server time in the same transaction as the
  placement transition, and prevents record changes in PostgreSQL. The
  assignment document renders that record as view-only.
- Shared Library and Settings styles were imported only by
  `ProgrammeAdminFrame`, leaving Student routes with bare controls and no
  spacing/layout. The shared stylesheet now loads at portal startup.

## Verification result

Result: **BLOCKED** for live acceptance. `sinaps health` reports 7% free disk,
Docker unavailable, no listeners, and no runtime processes; Argent reports no
Chromium target. No migration, build, API call, or rendered browser check was
run. Apply migration `placements.0007_placementacknowledgement` and execute this
journey in a clean Student account when the local environment is available.
