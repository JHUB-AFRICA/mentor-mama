# MentorMAMA — System Analysis & Design Document

**Version 2.0 — realigned to the confirmed domain model, business rules, and workflows**

| Field | Detail |
| --- | --- |
| Product | MentorMAMA — Digital Mentorship Toolkit for Safer Midwifery Clinical Placement |
| Prepared for | AfyaVentures 2026 Cohort / JHUB Africa Attachment Programme |
| Prepared by | Sinaps Technology — Bouric Okwaro Enos (Ric), Co-Founder & Team Lead |
| Document type | System Analysis & Design Document, following the JHUB Africa "Requirements to Reality" methodology |
| Supersedes | SADD v1.0 (July 2026) — see §11 for the change log and the Document Reconciliation Record for rationale |
| Source basis | Developer Concept Note v1.0, derived from Dr. Carolyne Kerubo Nyariki's research proposal, JKUAT School of Nursing |
| Version | 2.0 |
| Date | July 2026 |

---

## 1. Introduction & Purpose

### 1.1 What changed between v1.0 and v2.0

SADD v1.0 was written before the domain model existed. It went straight from the Concept Note's requirements to
classes, tables, and endpoints — and in doing so it made a set of structural decisions that the subsequent
design stages overturned. The most consequential: it modelled the mentorship relationship as a **junction
table** (`PlacementAssignment`) rather than as an aggregate, which quietly meant that reassigning a mentor
would overwrite the record of who had mentored the student until then.

v2.0 realigns this document to the four stages completed since:

| Stage | What it established |
| --- | --- |
| Stage 1 — Business Discovery | The ecosystem: two independent institutions meeting at exactly one shared object; the data-ownership table |
| Stage 2 — Domain Model | Placement as aggregate root; assignments as sub-entities; bounded contexts; domain events; the placement lifecycle |
| Stage 3 — Business Rules v1.1 | 19 policies, 18 invariants, 34 workflow rules, the transition tables, the authorization model, the error vocabulary |
| Stage 3.5 — Use Cases | All eight workflows with guard order, transaction boundaries, events, and exception paths |

Where this document and those stages disagree, **those stages win** and this document is the defect. That is
the authority order set out in the Document Reconciliation Record §1.1.

### 1.2 Two sections are deliberately provisional

**§6 (Data Design) and §8.3 (API Design) are marked provisional and must not be built against.** Stage 5
(Database Architecture) and Stage 6 (API Design) have not yet been produced. Fixing those sections now would
repeat exactly the mistake v1.0 made — specifying a schema and an endpoint list ahead of the design that should
determine them. They are retained as early sketches, clearly labelled, so nobody mistakes them for a contract.

### 1.3 Constraints & assumptions carried from the Concept Note

These are unchanged, and remain authoritative on scope:

- **No patient-identifiable data anywhere in the MVP.** Structurally enforced: no such field exists to write to
  (INV-18). Open-text fields carry the instruction at the point of entry (POL-015).
- The system must work on common Android phones over weak (3G/4G) connections, with draft-saving and retry
  sync on the two forms mentors complete on the ward floor.
- Pilot scope: one or two maternity units linked to JKUAT placement sites; 10–25 mentors; 30–80 students;
  8–12 weeks.
- AI features are Phase 2 only, restricted to mentorship and training, never patient-specific guidance.

---

## 2. What the System Is

MentorMAMA is a **governance layer over a relationship that already exists**.

A university sends a student into a hospital ward it does not control, expecting a stranger employed by that
hospital to supervise, teach, and vouch for that student's clinical competence. That relationship today runs on
goodwill, paper checklists, and whoever is on shift.

The two real customers are the **University**, accountable for producing competent midwives, and the
**Hospital**, accountable for what happens on its wards. They jointly own an outcome and share no system.
Everything else in the product is instrumentation on top of that.

This framing has one dominant architectural consequence, and it is the reason the authorization model is the
hardest part of this build: **neither institution has any authority inside the other.** A Nurse Manager does
not outrank a University Coordinator. They are non-overlapping jurisdictions meeting at one object — the
Placement. Access control is therefore not a role hierarchy; it is a scope intersection.

---

## 3. Actor & Stakeholder Analysis

### 3.1 MVP actors — five human, one system

**Corrected from v1.0**, which listed seven actors including a CPD/Content Reviewer with MVP permissions. That
role touches no part of the placement workflow, and the Concept Note itself defers regulator integration to
Phase 2 (§19). It remains in the vocabulary; it is out of the authorization model.

| Actor | Belongs to | Core responsibilities | Authorization boundary |
| --- | --- | --- | --- |
| **Student** | University (belongs to, not employed) | Confirm placement, complete orientation, receive mentorship, submit feedback and confidence self-assessments, raise concerns | Own placement records only. Never manages anyone |
| **Clinical Mentor** | Hospital (midwife, senior nurse, clinical instructor) | Complete training, complete induction per student, log mentorship sessions, review follow-ups | Placements where they are the **active** Mentor Assignment; own training record |
| **Nurse Manager / Ward In-Charge** | Hospital (operational manager) | Verify students and mentors, assign and reassign mentors, monitor induction and session activity, review and close escalations, pause and close placements, export facility reports | Facility-scoped, ward as a filter (AUTH-006) |
| **University Coordinator** | University | Create cohorts, enrol students, allocate students to facilities and wards, issue invitations, monitor placement quality, export institution reports | Institution-scoped; **session metadata only, never free text**; never hospital staff records |
| **Program Administrator** | Platform / Programme (JHUB Africa) | Configure institutions, facilities, wards, users, modules and content; programme-wide analytics | Programme-scoped. Configuration authority is **not** domain authority — cannot violate an invariant |
| **Notification Service** | System actor | Dispatch email (now), SMS/WhatsApp (Phase 2) on domain events | Triggered by events only. Executes; never decides |

**Phase 2:** CPD/Content Reviewer — reviews training content and confirms completion for CPD purposes.

### 3.2 Out-of-scope actors

Patients and guardians are not actors and have no interface; no patient-identifiable data is captured. Finance
and billing actors are out of scope, as payments are excluded from the MVP.

---

## 4. Use Case Analysis

**Superseded by Stage 3.5.** The eight core workflows are specified there with guard order, transaction
boundaries, domain events, and exception paths. This section retains only the catalogue and its traceability;
it does not restate the flows, because a second, shorter version of a specification is a second source of truth.

| ID | Use case | Primary actor(s) | Stage 3.5 workflow |
| --- | --- | --- | --- |
| UC-01 | Invite and activate account | Coordinator / Admin (invite); all roles (accept) | W-01 |
| UC-02 | Set up institution, facility, ward, cohort | Program Admin, Coordinator | W-01, W-02 |
| UC-03 | Create placement and allocate ward | Coordinator | W-02 |
| UC-04 | Assign / reassign mentor | Nurse Manager | W-03 |
| UC-05 | Complete mentor training module | Clinical Mentor | W-03 precondition |
| UC-06 | Complete labour ward induction and activate placement | Mentor, Nurse Manager | W-04 |
| UC-07 | Log a mentorship session (incl. offline retry) | Clinical Mentor | W-05 |
| UC-08 | Submit feedback, baseline and final assessment | Student | W-06 |
| UC-09 | Raise an escalation | Student, Mentor | W-07 |
| UC-10 | Review, resolve and close an escalation | Nurse Manager, Coordinator | W-07 |
| UC-11 | Complete placement, report and archive | Nurse Manager, system | W-08 |
| UC-12 | View dashboard and export report | NM, Coordinator, Admin | W-08 |
| UC-13 | Receive automated notification | All (via Notification Service) | Cross-cutting |

---

## 5. Domain Model

### 5.1 Design approach — two corrections to v1.0

**Correction 1: composition over role-inheritance is retained.** A single `User` with a role attribute and
role-scoped profile extensions, rather than a subclass hierarchy. This held up and is unchanged.

**Correction 2: Placement is an aggregate, not a junction.** v1.0's `PlacementAssignment` joined Student ↔
Mentor ↔ Ward ↔ Cohort in one row. Stage 2 replaced this with a Placement aggregate root containing
**assignment sub-entities**, each with its own validity period:

```
Placement  (aggregate root)
├── Student Assignment      (exactly one active — INV-01)
├── Mentor Assignment       (exactly one active, history preserved — POL-005, INV-12)
├── Ward Assignment         (exactly one active, history preserved — POL-004)
├── Induction Checklist     (one per placement, survives mentor reassignment)
├── Mentorship Sessions     (belong to the placement, not to a person — INV-03)
├── Pause Intervals         (first-class records, not a boolean)
└── Progress                (computed, never stored as authored truth)
```

The reason this matters in one sentence: **assignments change independently, and the history is the product.**
A mentor goes on leave in week 3; a student rotates ward in week 4. A junction row overwrites both facts, and
the university loses the ability to say who was responsible for what.

Adjacent aggregates, deliberately **not** inside Placement:

| Aggregate | Why it is separate |
| --- | --- |
| **Institution** (→ Cohorts) / **Facility** (→ Wards) | Organisational scoping; outlive any placement |
| **Training Module** (→ Lessons, Quiz, Completions) | Mentor training is facility-independent and outlives any single student relationship (POL-010) |
| **Escalation** (→ Reviews, Actions) | References a placement but has its own lifecycle and its own restricted visibility (INV-13) |
| **Assessment** (feedback, confidence, evaluations) | Evolves independently of the placement workflow; new survey instruments must not require placement changes |

### 5.2 Bounded contexts

| Context | Owns | Notes |
| --- | --- | --- |
| Identity | User, credentials, scope resolution | One organisation per user (AUTH-003) |
| Institution | Institution, Cohort, student enrolment | University side |
| Facility | Facility, Ward, capacity | Hospital side |
| **Placement (core)** | Placement, assignments, pauses, state machine | The core domain |
| Induction | Checklist templates (versioned), checklists, items | Placement-bound |
| Mentorship | Mentorship Sessions, follow-ups | Placement-bound |
| Learning | Training Modules, quizzes, completions | Facility-independent |
| Assessment | Feedback, confidence, evaluations | Immutable submissions |
| Safeguarding | Escalations, reviews, actions | Strictest access control |
| Analytics | Projections, dashboards, exports | Read-only, event-fed |
| Notification | Delivery only | Never decides (WFR-023) |

### 5.3 Placement lifecycle

Ten states, seventeen transitions, defined authoritatively in Stage 3 §5.2. Summary: `Draft → Scheduled →
Awaiting Student → Orientation → Induction → Active → Completed → Archived`, with `Active ⇄ Paused` lateral and
`Withdrawn` reachable from every non-terminal state.

Two properties of this model that v1.0 lacked entirely:

- **A placement cannot become `Active` until induction is complete** (INV-02). This is the core product promise
  — no unoriented student practising on a labour ward — and it is enforced in a transaction, not by screen
  order.
- **Escalation has an independent lifecycle** (`Open → Under Review → Action Required → Resolved → Closed`) and
  never redefines a placement's state. A placement stays `Active` while a concern is investigated, and multiple
  escalations can coexist.

### 5.4 Value objects

Person Name · Phone Number · Email · Placement Period · Competency Score · Ward Capacity · Progress Summary.

`Progress Summary` is computed on read, never persisted as an editable field (WFR-022) — a correction to
v1.0's `DashboardMetric` entity with stored `numerator`/`denominator` columns.

---

## 6. Data Design — ⚠️ PROVISIONAL

> **This section is not authoritative and must not be built against.**
> The relational schema is the **Stage 5** deliverable and does not yet exist. What follows states only the
> constraints that Stage 5 must satisfy, which are already known from Stage 3. The ERD, data dictionary, and
> indexing strategy in SADD v1.0 §5 are withdrawn: they described the junction-table model that Stage 2
> replaced.

Constraints Stage 5 must honour, each traceable to a rule:

| Requirement | Source |
| --- | --- |
| Partial unique indexes guaranteeing exactly one *active* Student / Mentor / Ward Assignment per placement | INV-01, INV-12 |
| Check constraints on all score ranges (0–100, 1–5) | INV-15 |
| Immutability of submitted feedback and assessments, and of terminal-state placements, enforced in the database | INV-09, INV-14 |
| No delete paths on operational tables; soft-archive only | INV-10 |
| Denormalised `institution_id` / `facility_id` on Placement for row-level scoping, with an invariant guaranteeing they equal derived values | POL-006, INV-17 |
| Ward capacity enforced under a row lock, not a read-then-write | INV-16, WFR-029 |
| Append-only audit table carrying actor, role, scope, action, target, before/after — and never restricted field values | WFR-030, WFR-034 |
| A transactional outbox table, written in the same transaction as the domain rows | WFR-026 |
| Versioned induction checklist templates, so live checklists never mutate underneath a mentor | Stage 3.5 §6.3 |
| Anonymous feedback with **no** placement or student reference | POL-014 |
| Optimistic version column or row-lock discipline on Placement for all state transitions | WFR-028 |
| Third normal form, with checklist items and scores as rows rather than JSON blobs — the data is audit and CPD evidence | Carried from v1.0 §5.1 |

One decision blocks Stage 5: **OD-01** — whether a pause extends the placement end date determines whether
placement dates are mutable, and therefore whether planned and actual dates are separate columns.

---

## 7. System Architecture

### 7.1 Pattern

A 3-tier layered architecture — Presentation, Application, Data — right-sized for a 3–6 developer team and
affordable managed hosting.

| Tier | Responsibility | Stack |
| --- | --- | --- |
| Presentation | Mobile-first PWA: dashboards, forms, checklists, local draft store and client outbox | React + TypeScript + Vite; Tailwind CSS |
| Application | Authentication, scope resolution, domain services, invariant enforcement, transactional outbox | Django + DRF |
| Data | Relational storage, projections, caching, file storage | PostgreSQL; Redis; S3-compatible object storage |

### 7.2 Module architecture — deferred to Stage 4, with one conclusion already fixed

Stage 4 will define module boundaries from the command and event surfaces in Stage 3.5 Appendices A and B. One
finding is recorded here because it affects the existing codebase:

**The current backend app layout cannot express the domain.** `backend/apps/` contains `sessions`, `induction`,
`feedback`, `escalations`, `training`, `facilities`, `dashboards`, and `content_library` — but **no
`placements` app at all.** The aggregate root that coordinates all eight workflows has no home, while three of
its children each have their own. Additionally, `apps/sessions` collides in name with
`django.contrib.sessions`. Stage 4 should restructure around the bounded contexts in §5.2 and treat the
existing app list as scaffolding to be replaced — cheap now, expensive once migrations exist.

### 7.3 Cross-cutting concerns

| Concern | Approach | Rule |
| --- | --- | --- |
| **Scope resolution** | Derived server-side from the authenticated principal on every request. Never read from a request body, and **never trusted from a token claim** — a claim is a cached copy that goes stale the moment a mentor is reassigned | AUTH-001 |
| **Row-level scoping** | Applied at the data-access layer, not the view layer. An endpoint that forgets its filter returns nothing, not everything | AUTH-002 |
| **Field-level restrictions** | Applied in serialisation, so no code path can leak a restricted field by returning a "full" object | AUTH-005, INV-13, POL-016 |
| **Offline support** | Local drafts plus a client outbox with a `command_id` generated at form-open time; server-side idempotency; late replays validated against **current** state and surfaced to the user if they no longer apply | Stage 3.5 §2.4, §7.4 |
| **Side effects** | Transactional outbox: events written in-transaction, dispatched after commit with retry. No external I/O inside a transaction | WFR-026, WFR-027 |
| **Notifications** | Email in MVP; SMS/WhatsApp Phase 2. Payloads carry identifiers and a template key — never escalation content, individual feedback, or session free text | WFR-025 |
| **Exports** | First-class, scope-filtered, field-restricted, and audited with actor, scope, filters, and row count | TX-09, WFR-032 |
| **Audit** | Append-only on every write; reads audited for escalation content, individual feedback, and exports | WFR-030, WFR-032 |

### 7.4 Authentication & authorisation

Invite-only accounts — no self-service sign-up, since every account must be tied to a verified institution or
facility. Authentication is email/phone plus password with invite redemption.

**Corrected from v1.0:** tokens carry **identity**, not authority. v1.0 put `facility_id`/`institution_id`
claims in the JWT and checked them at middleware; that grants a reassigned or deactivated user their old access
until the token expires. Scope is resolved per request from the user record.

Cross-scope access returns **404, not 403** (AUTH-004): a 403 confirms the record exists, which is itself a
disclosure when the record is a placement at another facility.

The full action matrix is Stage 3 §9.2 and is not duplicated here.

### 7.5 Non-functional requirements

Carried forward from v1.0 unchanged — these held up.

| Category | Requirement |
| --- | --- |
| Performance | Page load under 2s on 4G; facility-scoped dashboard queries under 1.5s; session-log form completable in under 3 minutes on a mid-range Android device |
| Availability | 99.5% during pilot; daily backups; RTO under 4 hours |
| Security | TLS 1.3 in transit, AES-256 at rest; audit logs on writes, escalation reads, and exports |
| Accessibility | Responsive from 375px; 4.5:1 minimum contrast; full keyboard navigability |
| Privacy | No patient-identifiable data in the schema; anonymised or aggregate reporting by default |
| Scalability | Additional facilities and institutions onboard without structural change |

---

## 8. Interfaces

### 8.1 Information architecture

Role-scoped zones, matching the authorization model.

| Zone | Key screens |
| --- | --- |
| Public | Landing, login, invite redemption |
| Student | Dashboard, My Placement, Sessions Received, Feedback & Confidence, Raise a Concern, Profile |
| Mentor | Dashboard, My Students, Training, Induction Checklist, Session Log, Follow-ups, **Unsynced Logs** (new — OD-09) |
| Nurse Manager | Dashboard, Mentor Assignment, Placements (incl. pause/complete), Escalations, Facility Reports |
| Coordinator | Dashboard, Cohorts & Students, Placements, Institution Reports |
| Program Admin | Dashboard, Institution/Facility/Ward setup, User Management, Content Library, Programme Reports |

### 8.2 UI principles

Mobile-first at 375px · progressive disclosure, since the session log and induction checklist are the
time-critical forms · **explicit state design**: every screen defines empty, loading, error, offline-queued, and
success states · accessibility as specified in §7.5.

The **offline-queued** state is new in v2.0 and is not optional: Stage 3.5 §7.4 established that a mentor's
queued work can fail validation on late arrival, and the mentor must be able to see and resolve that rather
than discover silently that a session was never recorded.

### 8.3 API design — ⚠️ PROVISIONAL

> **Not authoritative.** Transport design is the **Stage 6** deliverable. SADD v1.0 §6.3's endpoint list is
> withdrawn — most visibly `POST /api/placements` for "create/reassign", which conflated two operations with
> entirely different guard sets and actors.

Stage 6 will derive the transport surface from the **command surface** in Stage 3.5 Appendix A. Two
requirements are already fixed: every mutating operation accepts a client-generated idempotency key, and every
error response uses the shared domain error vocabulary in Stage 3 §12 rather than a generic HTTP status.

---

## 9. MVP Backlog & Acceptance Criteria

### 9.1 Epics

| Epic | Key story | Acceptance criterion |
| --- | --- | --- |
| Identity & scope | Admin invites users; users log in | Permissions differ by role; **cross-scope API access with a valid token returns 404**; deactivated users cannot access the system |
| Institution & facility setup | Admin/Coordinator create institutions, facilities, wards, cohorts | Students and mentors correctly linked; ward capacity recorded |
| Placement lifecycle | Coordinator creates placements; NM assigns mentors | Placement moves only along the Stage 3 transition table; illegal transitions rejected with `InvalidTransition` |
| Mentor training | Mentor completes modules and quizzes | Completion, score, date, and failed attempts all recorded |
| Induction & activation | Mentor completes checklist | Placement **cannot** become `Active` with required items outstanding; activation and completion commit atomically |
| Session logging | Mentor records an interaction | Saves in under 3 minutes; rejected outside `Active`; duplicate submissions idempotent; offline queue survives app restart |
| Feedback & assessment | Student submits feedback and confidence | Immutable once submitted; anonymous submissions carry no placement or student reference; mentor aggregates withheld below n = 3 |
| Safeguarding | Student/Mentor raise a concern; reviewer resolves it | Five-state lifecycle enforced; `description` unreadable outside reviewer/submitter/Admin; unauthorised access returns 404 and is audited; reviewer ≠ subject |
| Completion & reporting | NM completes placement; Coordinator exports | Completion blocked without final assessment or with an open escalation; exports scope-filtered, field-restricted, and audited |

### 9.2 System-level acceptance criteria

Carried from v1.0, plus four invariant-enforcement criteria that v1.0 could not state because the invariants
did not exist yet:

1. Each of the five human roles completes their core workflow without developer support.
2. A mentor completes a module, passes a quiz, and sees completion status.
3. A mentor completes an induction checklist and logs a session in under three minutes on a mid-range Android
   phone.
4. A student submits feedback and a confidence rating from a phone.
5. A Nurse Manager sees incomplete inductions, inactive mentors, and unresolved escalations.
6. A Coordinator exports CSV/XLSX scoped to their institution.
7. The system runs on common Android phones and modern browsers, and retains drafts across connectivity loss
   and app restart.
8. **Row-level and field-level access control are verified by test, including direct API attempts from another
   facility's valid token.**
9. **A session cannot be persisted for a non-`Active` placement, outside the placement window, or inside a
   pause interval — verified by test, not by UI inspection.**
10. **A placement cannot be activated with an incomplete induction, nor completed with a missing final
    assessment or an open escalation — verified by test.**
11. **Every write produces an audit entry, and every override records a reason — verified by test.**
12. No workflow requires patient-identifiable data.

---

## 10. Risks & Open Decisions

### 10.1 Risks

| Risk | Likelihood / impact | Mitigation |
| --- | --- | --- |
| Weak ward connectivity disrupts session logging | High / medium | Local drafts, client outbox, idempotency keys, sub-3-minute form, visible unsynced queue |
| Late-arriving offline logs fail validation and are lost | Medium / high | Retained client-side and surfaced for human resolution; never silently discarded (OD-09) |
| Mentor engagement drops after novelty | Medium / high | CPD-eligible completion summaries; manager visibility into activity |
| Escalation content exposure | Low / severe | Field-level restriction in serialisation, reviewer conflict rules, audited reads, no content in any event or notification payload |
| Patient identifiers typed into free text | Medium / severe | Point-of-entry instruction and reviewer redaction. **Residual, not solved** — must be named in the data-governance sign-off |
| Invariants enforced only at the service layer | Medium / high | Safeguarding and integrity rules pushed to `DB`/`TXN`; walking-skeleton spike before feature build to prove enforceability |
| Scope creep toward EMR features | Medium / high | MVP excludes patient data and clinical decision support (§1.3) |
| Schema built ahead of Stage 5 | Medium / high | §6 and §8.3 marked provisional; no migrations until Stage 5 lands |

### 10.2 Open decisions

Eleven decisions are tracked in the consolidated register (Document Reconciliation Record §7). Three affect
immediate work: **OD-03** and **OD-06** block pilot data collection because they gate consent wording;
**OD-01** blocks Stage 5 because it determines whether placement dates are mutable.

---

## 11. Change Log — v1.0 → v2.0

| # | Change | Reason |
| --- | --- | --- |
| 1 | Placement modelled as an aggregate with assignment sub-entities, replacing the `PlacementAssignment` junction | A junction row overwrites relationships on change; the history of who mentored whom, and when, is the product |
| 2 | Sessions, induction checklists, and progress reparented from `StudentProfile`/`MentorProfile` to Placement | A student has many placements over time; person-owned records cannot be told apart |
| 3 | Placement dates and `assigned_mentor` removed from `StudentProfile` | Same reason; a second placement would overwrite the first |
| 4 | Actor set reduced from seven to six; CPD Reviewer moved to Phase 2 | That role touches no placement workflow, and the Concept Note already defers regulator integration |
| 5 | Placement lifecycle added (ten states, seventeen transitions) | v1.0 had no lifecycle; "active" would have become a boolean someone flips |
| 6 | Escalation given a formal five-state lifecycle, conflict-of-interest rule, and field-level access control | v1.0 described the safeguarding workflow narratively — the most consequential path had the least specification |
| 7 | `DashboardMetric` entity replaced by computed projections | Stored metrics drift from the facts they summarise |
| 8 | Transactional outbox introduced; notifications and projections moved out of the write path | An email timeout must not roll back a valid mentor assignment, and a sent email cannot be un-sent |
| 9 | JWT scope claims replaced by per-request server-side scope resolution | A token claim grants a reassigned user their old facility access until expiry |
| 10 | Cross-scope denial changed from 403 to 404 | A 403 confirms the record exists |
| 11 | Field-level restrictions added: coordinator sees session metadata only; mentors see feedback aggregates at n ≥ 3; escalation content restricted to reviewer, submitter, and Admin | Enforces the Stage 1 data-ownership boundaries, which v1.0 stated but did not implement |
| 12 | Ward capacity enforced as an invariant under a row lock | `max_students` existed in v1.0's data dictionary and was enforced by nothing |
| 13 | §5 Data Design and §6.3 API Design withdrawn and marked provisional | They preceded the domain model; replacing them now would repeat the error out of sequence |
| 14 | §3 use cases and §8 workflows superseded by Stage 3.5 | A shorter second copy of a specification becomes a competing source of truth |
| 15 | Offline behaviour specified end to end, including idempotency keys, late-replay validation, and a mentor-visible unsynced queue | v1.0 said "draft-saving and retry sync", which understates a path that guarantees replays |
| 16 | Acceptance criteria extended with four invariant-enforcement tests | Rules that no test exercises are documentation, not constraints |
| 17 | Backend app-layout finding recorded (§7.2) | The aggregate root has no home in the current scaffold, while three of its children do |

---

*End of System Analysis & Design Document v2.0 — Sinaps Technology / JHUB Africa. Confidential.*
