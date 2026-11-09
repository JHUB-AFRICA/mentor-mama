# MentorMAMA — MVP Requirements

## 1. MVP objective

Deliver one safe, reliable mentor workflow for a pilot:

```text
assigned mentor → student induction → mentorship session → reliable sync
```

The first release must prove this workflow on a real ward-floor device before
expanding into broad dashboards, exports, notifications, or advanced analytics.

## 2. Users and capabilities

| User | MVP responsibility |
| --- | --- |
| Student | Confirm placement, complete orientation, submit feedback or a concern |
| Clinical mentor | Complete induction, log sessions, resolve unsynced submissions |
| Nurse manager / ward in-charge | Assign mentors, operate placements, review authorised concerns |
| University coordinator | Create placements, monitor institution-scoped progress, read approved feedback |
| Programme administrator | Programme-wide administration and controlled fallback actions |

## 3. Functional requirements

### Placement lifecycle

- A placement belongs to one student, cohort, institution, facility, ward, and active mentor at a time.
- Assignment and reassignment history must be preserved.
- Placement states are server-owned and transition through the documented state machine.
- Ward capacity is a hard allocation constraint.
- Programme Admins can record optional institutional and facility contact details
  (contact person, email, and phone) for operational coordination.
- Programme Admins can upload an optional partner logo in PNG, JPEG, or WebP
  format, limited to 2 MB and 4096 pixels per dimension. Logo collection in the
  directory does not itself grant consent for public display.
- Pauses record controlled reason, start, and resumption; paused time extends `actual_end`.
- Completion is blocked by missing final assessment or unresolved safeguarding concerns.

### Induction and sessions

- A placement cannot become active until required induction items are answered and signed.
- Only the currently assigned mentor may log a session.
- A mentor may record one shared session for all eligible assigned students or a
  selected subset who attended. The server creates one placement-scoped history
  record per selected student in one atomic, idempotent command; attendance is
  never inferred from assignment alone. A shared note is copied to each record,
  so the interface must make that clear before submission. Batch size is capped
  at 100 and the mentor roster must include all assigned students across pages.
- A mentor may complete one induction handoff for students who attended the same
  orientation, with each checklist answer saved to each student's separate
  record. Group answers are used only when they apply to everyone; exceptions
  are handled in the individual checklist. Each signed checklist remains an
  individual mentor attestation and activates only its own placement.
- Students personally review and acknowledge their placement orientation.
  Mentors can request reminders for all selected students still waiting, but
  cannot acknowledge or sign on a student's behalf.
- Orientation-acknowledged placements surface the mentor-owned next action:
  open and complete the required induction checklist. Logging is available only
  after induction has activated the placement.
- Sessions require a date, type, and at least one topic.
- Session dates must fall inside the effective placement window and outside pauses.
- Duplicate submissions are satisfied idempotently and must not create duplicate sessions.
- A mentor can submit in unreliable connectivity conditions; uncertain or rejected work remains visible.

### Cohort administration and lifecycle notifications

- Coordinators can edit and archive institution-scoped cohorts. Archiving is soft and preserves cohort and placement history.
- Bulk enrolment previews up to 100 students, reports existing memberships and date-overlap conflicts, and revalidates the complete set before an atomic commit.
- Cohort progress reports placements by lifecycle state and enrolled students without placements; it does not infer an unsupported completion percentage.
- Membership correction/removal requires a reason and preserves actor, time, and prior membership history.
- Account invitations, verification, recovery, MFA, and security changes are delivered as plain-text email. Security and account-access mail cannot be disabled.
- Placement handoff updates notify the next responsible participant. Email preference controls apply only to optional updates; safeguarding and session details are never copied into email.

### Privacy and safeguarding

- No schema field stores patient-identifiable information.
- Open-text entry shows a no-patient-identifiers instruction.
- Confidential feedback is placement-linked and visible only to authorised reviewers.
- Anonymous feedback contains no student or placement reference and is linked only to cohort, facility, ward, and submission date. It collects fixed ratings without free text and does not create actor-linked audit, outbox, or generic idempotency records.
- Anonymous feedback reports expose only ward-level score aggregates after at least three submissions, scoped to Coordinators' institution and Nurse Managers' facility. Individual records and comments are never reported.
- Mentors see only aggregate confidential feedback figures with at least three responses and no identifying breakdown.
- Escalation restricted fields are never exposed in lists, exports, notifications, or logs.

### Platform contracts

- Every command requires an idempotency key.
- Every successful write commits its domain record, audit entry, outbox event, and idempotency result together.
- Scope and capabilities are enforced on the server, under the aggregate lock where relevant.
- Domain errors expose stable codes and a `retryable` flag for offline reconciliation.

## 4. Success measures

- Median valid mentor session log completion is two minutes or less; hard target is three minutes.
- An offline or uncertain submission becomes exactly one server record or a visible Needs attention item.
- Cross-scope users cannot infer another institution or facility's records.
- Required induction, pause, completion, feedback, and safeguarding invariants pass automated tests.
- A complete mentor journey passes on a real target browser/device before pilot launch.

## 5. Explicitly deferred

- CPD/content reviewer role
- Native mobile application
- SMS/WhatsApp notification delivery
- Broad reporting and advanced analytics
- In-app capacity negotiation
- Co-mentorship
- AI features

## 5a. Programme setup governance

- An active Programme Admin owns the shared institution, facility, and ward directory. Nurse Managers perform facility-scoped placement operations and cannot edit shared ward configuration.
- Ward occupancy display and admission use the same placement lifecycle states: Orientation, Induction, Active, and Paused. A capacity reduction below occupancy is rejected with a conflict response.
- Programme owner is required and must be an active Programme Admin in the same programme.
- Programme setup must distinguish active directory records from pilot coverage. Only an explicit Programme Admin review can confirm coverage; the UI and audit record identify the reviewer and time.
- Any institution, facility, or ward directory mutation invalidates the prior coverage review.
- Exact institution/facility name matches are warned about but do not block creation, since programme directories may contain branches or campuses with the same name.
- Uploaded partner logos are not public endorsements. Website publication requires separate partner consent and a production media policy.

## 6. Traceability

Detailed rules, transitions, and acceptance scenarios remain in:

- `docs/architecture/stage3-business-rules-and-invariants.md`
- `docs/architecture/stage3.5-use-cases-and-sequence-diagrams.md`
- `docs/architecture/stage8-sprints-and-delivery.md`
