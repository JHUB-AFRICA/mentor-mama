# Mentor session log

## Purpose

The mentorship session is a placement-bound teaching record. It is created by
the currently assigned mentor for the selected student’s placement; it is not a
standalone mentor note and it does not create a second student relationship.

## Data relationship

```text
Placement
  ├── active StudentAssignment → student
  ├── active MentorAssignment → mentor
  └── Mentorship Session
        └── mentor_assignment (historical attribution)
```

The session stores date, type, topics, optional duration, what was covered,
feedback given, and a follow-up action. The student is resolved through the
placement’s active student assignment. The mentor assignment is stored on the
session so historical entries remain attributable after reassignment.

## Interaction rules

- Only the current mentor can submit for the placement.
- The placement must be active, within its effective date window, and not paused.
- At least one topic is required; notes and follow-up are optional.
- Free-text fields display a no-patient-identifiers warning.
- Drafts persist locally on every change and carry one command ID from form open
  through retry/reconciliation.
- A server retry is idempotent and creates exactly one session.

## Workspace separation

The mentor experience deliberately separates two jobs:

- **Log a session** is a focused write flow. It selects one assigned student and
  captures one record; it does not repeat the student’s history beneath the
  form.
- **Student detail** is the read-and-understand workspace. It owns progress,
  placement context, safeguarding visibility, and the mentorship timeline.

The student detail timeline uses compact rows for scanning. Selecting a row
opens the complete session record, including date, type, topics, duration,
learning notes, feedback, follow-up, and submission time. This keeps the fast
logging path calm while making the durable record genuinely reviewable.

The detail page is reached at `/mentor/students/:placementId`; the write flow
uses `/mentor?view=log&placement=:placementId` for direct preselection.

Secondary safeguarding is exposed as a clearly labelled button from the
student record and opens a dedicated protected modal. It is not rendered as a
full-height form in the primary student review flow. The modal can be closed
with the close button, outside click, or Escape.

## Fields

| Field | Required | Purpose |
| --- | --- | --- |
| Date | Yes | Date of the mentorship interaction |
| Session type | Yes | Debrief, bedside teaching, feedback, or related type |
| Topics | Yes, one or more | Structured learning themes |
| Time spent | No | 5, 10, 15, 30, or 45+ minutes |
| What was covered | No | Short learning summary |
| Feedback given | No | Feedback shared with the student |
| Follow-up | No | None, next-shift review, skill practice, supervisor follow-up, or student support referral |

The server remains authoritative for authorization, state, date window, pause,
duplicate, and privacy rules.
