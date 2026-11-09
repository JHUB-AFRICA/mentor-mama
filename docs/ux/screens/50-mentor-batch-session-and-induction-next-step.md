# Mentor group session and induction handoff

## Goal

Let a mentor enter a shared session once for the students who actually attended,
while keeping each student's history and the placement lifecycle authoritative.

## Session journey

1. Open Log session. The roster shows only the mentor's currently assigned,
   Active placements that can accept a session on the chosen date.
2. Choose Select all eligible or check the students who attended. Search and
   selection remain available together; the selection count is always visible.
3. Enter date, type, duration, topics, shared learning notes, and follow-up once.
   Explain that the same notes are saved to every selected student's record.
4. Save once. The API validates every selected placement, then commits all
   individual session records and the batch result in one transaction.
5. On success, show how many records were created and whether any existing
   records satisfied the duplicate rule. Do not clear the draft on failure.
6. If offline, retain the full batch and same command ID until the server
   confirms it. Show selected student names and Needs attention on permanent
   validation failure; never sync only a subset.

## Induction handoff

- Student owns orientation review and acknowledgement. The mentor can request a
  reminder for all selected students who are still waiting; the reminder asks
  each student to sign in and complete their own acknowledgement.
- Once acknowledged, the currently assigned Mentor owns opening and completing
  the checklist. Students who attended the same handoff can be selected as a
  group when they share a checklist version. Each answer and shared note is
  copied to each student's separate checklist, and signing activates each
  placement through its own record.
- Group answers are only for steps that were completed for everyone. The page
  lists attendees and current answers, explains the shared note, and directs
  any student-specific difference to that student's individual checklist.
- Checklist items use short, concrete wording that explains the action (for
  example, show ward areas and reporting contacts; point out exits and PPE;
  explain how to raise a safety concern). Use “Done”, “Not yet”, and “Does not
  apply” consistently, with an optional note for a practical detail or follow-up.
- Induction must look like the rest of the Mentor workspace: navy headings,
  teal action and progress cues, soft neutral panels, clear numbered items,
  mobile stacking, visible focus, and readable spacing. Progress and signing
  status remain visible while completing a long checklist.
- At Orientation, the Mentor workspace's next-step action must say to start
  induction and link to that student's detail. At Induction it must continue the
  checklist. Session logging remains unavailable until Active.
- Active placements point to the next due mentorship session; Paused and
  terminal placements explain why logging is unavailable and do not invite a
  rejected write.

## Recovery and privacy

- Validation of any selected placement fails the batch as a whole and identifies
  only placements the mentor is authorized to see.
- Duplicate results are reported per student and do not create another session.
- Notes remain placement-scoped and must not contain patient identifiers or
  private information that does not belong in every selected student's record.
- Keyboard users can select rows and operate Select all; mobile selection and
  submission remain usable without horizontal scrolling.

## Acceptance

- One session for all eligible students creates one history record per selected
  placement with identical shared content and one common batch identifier.
- A subset creates records only for the selected students.
- Unassigned, non-Active, paused-window, or out-of-window placements reject the
  request without partial records.
- A lost response followed by retry returns the same batch and does not create
  duplicate records.
- Existing duplicate-window behavior is honored per placement and shown in the
  response.
- Offline retry preserves the entire selected set and idempotency key.
- Batch reminder requests are atomic and idempotent; they do not write an
  acknowledgement or imply that a student has completed the personal step.
- Group induction creates and signs a separate checklist for every selected
  student; one incomplete required item prevents the entire group from signing.
- Orientation-acknowledged student detail presents Start induction; signing the
  checklist activates the placement and then makes the session action available.
