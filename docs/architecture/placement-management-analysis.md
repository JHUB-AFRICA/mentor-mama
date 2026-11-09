# MentorMAMA — Placement Management Domain Analysis

**Status:** Discovery complete; offline session reliability in build
**Current implementation slice:** Access/setup, lifecycle, participant confirmation, induction, and mentor session loop
**Next implementation slice:** Completion hardening beyond final assessment, then richer offline/reconciliation coverage

## 1. Purpose

Placement Management is the core operational domain between account onboarding
and the mentor workflow. It connects one student to one institution, facility,
ward, and mentor for a controlled placement period. The server owns scope,
assignment history, capacity, lifecycle state, pause extension, completion
blockers, and idempotent commands.

The product goal is not a generic CRUD table. It is a safe operational journey:

```text
coordinator creates placement
  → ward is allocated
  → nurse manager assigns mentor
  → student confirms
  → orientation and induction complete
  → mentor sees the placement and logs sessions
  → staff pause/resume/complete/withdraw with an audited reason
```

## 2. Actors and authority

| Actor | Placement responsibility | Visible scope |
| --- | --- | --- |
| Programme Admin | Programme-wide visibility and controlled fallback actions | All programme placements |
| University Coordinator | Create placements, monitor institution progress, confirm student-facing setup | Own institution |
| Nurse Manager / Ward In-charge | Allocate/operate facility placements, assign or reassign mentors, pause/resume, review operational state | Own facility; ward as filter |
| Student | Confirm an assigned placement and complete orientation/own induction actions | Own placements only |
| Clinical Mentor | Complete mentor induction and log sessions for the current assignment | Own assigned placements only |

The UI may hide unavailable commands, but every read and command is authorized
again in the backend service under the placement lock. A scope miss is returned
as a non-disclosing not-found response.

## 3. Aggregate and invariants

The existing `placements.Placement` aggregate owns:

- cohort, derived institution, optional facility, planned and effective dates;
- server-owned lifecycle state;
- student, mentor, and ward assignment histories as interval records;
- pause intervals with controlled reason and resumption actor;
- withdrawal/completion/archive facts and optimistic versioning.

The important rules are:

1. A placement has one active student, one active mentor, and one active ward at a time; history is retained.
2. A student cannot have overlapping placements.
3. Ward capacity is a hard allocation constraint for occupying states.
4. A placement schedules automatically when the assignment set is complete; neither institution may press the other institution’s button.
5. Student confirmation and induction activation are system-derived transitions with actor assertions.
6. A placement cannot activate until required induction is complete.
7. A session can only be written by the current mentor, while active, inside the effective window and outside a pause.
8. Pause duration extends `actual_end`; planned dates remain the original agreement.
9. Completion is blocked by registered safeguarding/final-assessment blockers.
10. Commands are idempotent and commit the domain write, audit record, outbox event, and replay result together.

## 4. Lifecycle state model

```text
DRAFT → SCHEDULED → AWAITING_STUDENT → ORIENTATION → INDUCTION → ACTIVE
  │          │              │              │             │          │
  └──────────┴──────────────┴──────────────┴─────────────┴──────────┴→ WITHDRAWN
                                                               ACTIVE ↔ PAUSED
                                                               ACTIVE → COMPLETED → ARCHIVED
```

The transition table is server-owned in `state_machine.py`. The frontend must
consume `/transitions` and render the returned available commands and blockers;
it must not recreate transition rules from state strings.

## 5. Current implementation baseline

The backend foundation already contains the domain aggregate, state machine,
placement services, scoped selectors, command views, idempotency wrapper,
transition endpoint, placement window guard, and the mentorship session guard.
The portal now has a mentor placement list/detail/session shell with scoped
participant projections. Mentor queries are restricted to active mentor
assignments and student queries to active student assignments; neither role
receives the broader institution/facility management list. The portal can read
placements, transitions, placement-scoped activity, and write a session online.

The implementation now covers the first operational journey and the core
participant handoff: scoped access/setup, lifecycle commands, confirmation,
orientation, induction checklist actions, placement history, and mentor session
entry. It is not yet the complete Placement Management product; lifecycle
hardening, completion blockers, and offline/reconciliation reliability remain.

## 6. Planned implementation slices

### Slice A — Placement access and setup — Implemented

- coordinator placement list with institution-scoped filters and empty state;
- create-placement flow using an enrolled student and cohort date window;
- nurse-manager ward allocation with capacity shown before confirmation;
- mentor assignment/reassignment with reason capture;
- placement detail timeline showing assignment history and state;
- command status, replay, loading, error, and success feedback.

### Slice B — Student confirmation and induction handoff — Implemented

- student “confirm placement” state;
- orientation handoff and clear next action;
- role-specific induction entry points;
- transition blockers and server messages rendered in plain language.

### Slice C — Mentor core loop — Core path implemented

- Today/assigned placements screen;
- placement detail with induction status and current mentor assignment;
- fast session form with no-patient-identifiers warning;
- server validation mapped to field/page errors;
- visible success confirmation and duplicate-safe retry behavior.

### Slice D — Lifecycle hardening and offline reliability — In progress

- pause/resume with controlled reason, note, and dates;
- completion blockers and final-assessment handoff;
- withdraw/archive history;
- durable local session drafts, retry queue, lost-response reconciliation, and
  Needs attention are implemented in the portal; browser/API verification is
  pending the environment resource gate.

The final-assessment handoff is now implemented through the assessments module:
the assigned student can submit an immutable exit survey and endline confidence
rating after the effective placement end date. Completion remains a separate
placement command and continues to enforce safeguarding and assessment blockers.

## 7. API and architecture rules

- Keep `/api/v1/placements` as the versioned boundary.
- Keep serializers transport-only, views thin, services authoritative, and
  selectors responsible for scoped reads.
- Use placement public APIs from sibling modules; do not import placement models
  across module boundaries.
- Every mutating command carries an `Idempotency-Key` and returns replay metadata.
- Do not accept institution, facility, ward, or role scope as trusted client
  authority; derive and validate it server-side.
- Return stable domain error codes with retryability so the frontend can decide
  whether to retry, correct input, or show Needs attention.

## 8. Discovery decisions before implementation

The current architecture already settles the high-risk decisions: ward capacity
is a hard block, pause extends the effective end date, co-mentorship is deferred,
and completion uses dependency-inverted blockers. Before Slice A implementation,
the remaining product check is the exact placement creation form and the ward
allocation/mentor assignment handoff: which roles perform each action in the
pilot UI and whether the coordinator or nurse manager sees the shared detail
screen first. This is a UX sequencing choice, not an authorization change.

Student confirmation and the mentor induction handoff now use explicit versioned
commands. Induction checklist answers and signing are owned by the induction
service, while placement scope and activation remain enforced by the placement
and identity boundaries.

## 9. Route and module boundary

Placement Management is exposed under the authenticated portal route
`/placements`. Management roles (Programme Admin, University Coordinator, and
Nurse Manager) receive the shared sidebar/header workspace and the scoped
management list/detail surface. Students and mentors receive the same portal
shell through a focused participant workspace with only their active placement
projections.

The current detail selection is an in-workspace state under `/placements`; a
future deep-link route such as `/placements/:placementId` may be added when
refresh-safe detail navigation is required. The API already supports
placement-ID based detail and scoped access.

Placement is one bounded domain with child workflows—not separate top-level
modules: setup/allocation, lifecycle, participant confirmation/orientation,
induction, session logging, and audit history. Cross-module data is accessed
through public APIs/selectors and service boundaries rather than sibling model
imports.

Identity scope validation follows the Stage 4 dependency-inversion pattern:
Institutions and Facilities register their owning scope validators through the
Identity public API at application startup. Identity does not import either
domain module to validate invitation scope.

Archive hardening is now implemented as an explicit Programme Admin command for
the `Completed → Archived` transition. It uses the server capability matrix and
the existing transition table, preserving the terminal read-only invariant.
