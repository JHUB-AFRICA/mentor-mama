# MentorMAMA — Document Reconciliation Record

**Every contradiction between the founding documents and the confirmed design, with its resolution**

| Field | Detail |
| --- | --- |
| Product | MentorMAMA — Digital Mentorship Toolkit for Safer Midwifery Clinical Placement |
| Prepared by | Sinaps Technology — Bouric Okwaro Enos (Ric), Co-Founder & Team Lead |
| Document type | Reconciliation Record & Supersession Notice |
| Covers | Developer Concept Note v1.0 · Stage 1 Business Discovery v1.0 · SADD v1.0 |
| Against | Stage 2 Domain Model · Stage 3 Business Rules v1.1 · Stage 3.5 Use Cases v1.0 |
| Version | 1.4 (register updated through Stage 7; walking skeleton built) |
| Date | July 2026 |

---

## 1. Why This Document Exists

Three documents preceded the domain model: the **Developer Concept Note** (the requirements — the "what"), the
**Stage 1 Business Discovery Report** (the ecosystem and process), and the **SADD v1.0** (the first technical
blueprint). Stages 2, 3, and 3.5 then changed a number of conclusions — deliberately, because that is what the
design sequence is for.

The failure mode we are avoiding is the common one: four documents in a repository, mutually contradicting, and
a developer picking whichever they opened first. So this record does three things:

1. **Establishes an authority order** — which document wins when two disagree.
2. **Lists every material contradiction** with its resolution, so nothing is silently overridden.
3. **States what happens to each source document** — amended, superseded in part, or left as a historical
   record.

### 1.1 Authority order

When two documents disagree, the later stage wins, with one exception:

```
Stage 3.5 Use Cases  ─┐
Stage 3 Business Rules ├── authoritative for behaviour, rules, and sequence
Stage 2 Domain Model  ─┘

Stage 1 Business Discovery ─── authoritative for the ecosystem, actors, and data ownership

Developer Concept Note ─────── authoritative for SCOPE and for the research/programme
                               requirements it carries from the source proposal

SADD v1.0 ─────────────────── superseded; see §4
```

**The exception:** the Concept Note remains authoritative on **scope and programme intent** — what is in and
out of the MVP, the no-patient-data rule, pilot size, the phased AI boundary. Later stages may refine *how*
those are achieved, but may not quietly expand what is being built. Where a later stage narrows or defers
something in the Concept Note, it is listed in §3 as a scope change requiring stakeholder acknowledgement,
not as an engineering decision.

### 1.2 What is NOT being rewritten, and why

The **Developer Concept Note is not edited.** It is derived from Dr. Carolyne Kerubo Nyariki's research
proposal (JKUAT School of Nursing) and prepared for AfyaVentures/JHUB Africa; it is an upstream artifact whose
provenance is the point. Silently rewriting a source specification to match our current thinking destroys the
audit trail of *why* things changed — which matters more here than usual, because this product may be part of
a research evaluation. Contradictions with it are therefore raised as **amendments** (§3) for stakeholder
acknowledgement.

The **Stage 1 report is corrected by errata** (§5) rather than reissued, because its defects are internal
numbering inconsistencies rather than wrong conclusions. Its substance held up completely — Placement as
aggregate root, the two-jurisdiction model, and the data-ownership table all survived Stages 2 and 3 intact and
are now the backbone of the authorization model.

The **SADD v1.0 is superseded** by SADD v2.0 (§4), because it is ours, it is the document developers will
actually open, and several of its statements are now wrong in ways that would produce wrong code.

---

## 2. Contradictions With the SADD v1.0

| # | SADD v1.0 says | Confirmed design says | Resolution | Impact if unresolved |
| --- | --- | --- | --- | --- |
| S-01 | `PlacementAssignment` is a **junction table** linking Student ↔ Mentor ↔ Ward ↔ Cohort (§4.2, §4.3) | **Placement** is the aggregate root; Student Assignment, Mentor Assignment, and Ward Assignment are *sub-entities inside it*, each with its own open/close history (Stage 2) | Adopt the aggregate model. A junction row overwrites relationships on change; sub-entities preserve them | Mentor reassignment would destroy the record of who mentored the student in weeks 1–3 |
| S-02 | `MentorshipSession` has `student_id` + `mentor_id` FKs (§4.2) | A Session belongs to **exactly one Placement** (INV-03) | Sessions reference the placement; mentor is recorded as the acting assignment | A student's sessions across two different placements would be indistinguishable |
| S-03 | `InductionChecklist` hangs off StudentProfile and MentorProfile (§4.2) | Induction belongs to the Placement and survives mentor reassignment (Stage 3.5 §5.3) | Reparent to Placement | A reassignment would orphan or duplicate the induction |
| S-04 | `StudentFeedback` references `student_id` (§4.2) | Anonymous feedback attaches to Cohort + Facility + Ward and **never** to Student or Placement (POL-014) | Two routing paths by anonymity mode | "Anonymous" feedback that is trivially re-identifiable — a governance failure, not a bug |
| S-05 | `StudentProfile` carries `placement_facility`, `placement_start/end`, `assigned_mentor` (§5.3) | Those are Placement attributes; a student has many placements over time (Stage 2) | Remove from the profile | A second placement would overwrite the first |
| S-06 | Seven actors, including **CPD/Content Reviewer** as an MVP role with permissions (§2.1, §6.4) | CPD Reviewer is deferred to Phase 2 and is out of the MVP authorization model (Stage 1 §5.2) | Six actors in the MVP; CPD Reviewer stays in the vocabulary only | Building and testing an unused role hierarchy |
| S-07 | Escalation status list is informal: "resolved" or "escalated further" (§3.3) | Five states with a formal transition table; external referral is a **resolution outcome**, not a state (WFR-006) | Adopt the Stage 3 escalation state machine | The safeguarding workflow would be the only lifecycle in the system without enforceable transitions |
| S-08 | No Placement lifecycle at all — no states, no transitions | Ten states, seventeen transitions, guards and initiating actors (Stage 3 §5.2) | Adopt the transition table | Every workflow rule becomes unenforceable; "active" becomes a boolean someone flips |
| S-09 | "Induction occurs before active mentorship" is implied narratively (§8.1) | INV-02: a placement **cannot** become `Active` until induction is complete | Enforce at `TXN` | The core product promise — no unoriented student on a labour ward — would rely on UI ordering |
| S-10 | Nurse Manager read scope is "facility-wide"; Stage 1 describes ward-level management | Facility-scoped authorization with ward as a **filter**, revisited if a facility runs multiple mentoring units (AUTH-006, OD-04) | Documented explicitly rather than left as two readings | Two developers implementing two different boundaries |
| S-11 | Coordinator has institution-wide read of cohorts and students (§6.4), with no field-level limits | Coordinator reads session **metadata only**, never free text, and never mentor master records (POL-016, POL-017) | Field-level restrictions in serialisation | Breach of the hospital-owns-its-staff-records boundary from Stage 1 §8 |
| S-12 | Mentor "receives CPD completion summaries"; feedback visibility unresolved | Mentors never read individual feedback about themselves; aggregates only at n ≥ 3 (POL-013) | Adopt the min-n threshold | A single student's feedback identifiable to the mentor it concerns |
| S-13 | `DashboardMetric` is a stored entity with `numerator`/`denominator` (§4.2, §5.3) | Progress and indicators are **computed on read**, never authored (WFR-021, WFR-022) | Materialised projection, refreshed from events — never a hand-editable row | Metrics that can drift from the facts they summarise |
| S-14 | Domain events publish to notifications, described as part of the write path (§4.4) | Events are written to a transactional outbox in-transaction and dispatched **after** commit (WFR-026) | Adopt the outbox | An email provider timeout rolls back a valid mentor assignment |
| S-15 | REST endpoints specified (§6.3), e.g. `POST /api/placements` "create/reassign" | Endpoints are a Stage 6 concern; Stage 3.5 defines **commands** (`AssignMentor`, `ReassignMentor` as distinct operations) | §6.3 marked provisional pending Stage 6 | Conflating create and reassign in one endpoint hides two different guard sets |
| S-16 | Full ERD, data dictionary, and indexing strategy presented as settled (§5) | Stage 5 has not happened. The schema must follow the domain model, not precede it | §5 marked provisional pending Stage 5 | The original mistake repeated: schema before rules |
| S-17 | Auth returns a JWT with `facility_id`/`institution_id` claims (§6.4) | Scope is resolved server-side per request from the principal; a token claim is a cached copy that goes stale on reassignment (AUTH-001) | Scope resolved per request; tokens carry identity, not authority | A mentor reassigned to another facility keeps their old access until the token expires |
| S-18 | Nothing on ward capacity enforcement, though `Ward.max_students` exists | INV-16 with a row lock on the Ward (POL-007) | Enforce at `TXN` | Over-allocation of a labour ward — a real-world safety and quality issue |

---

## 3. Amendments Requested Against the Concept Note v1.0

These are **not** defects in the Concept Note. They are places where the design sequence produced a different
answer, and where the change should be acknowledged by AfyaVentures/JKUAT rather than absorbed silently.

| # | Concept Note position | Confirmed design position | Nature of change | Needs sign-off? |
| --- | --- | --- | --- | --- |
| C-01 | Six user roles including **CPD/Content Reviewer** (§4) | CPD Reviewer deferred to Phase 2 (Stage 1 §5.2), consistent with the Note's own deferral of regulator integration (§19) | Scope reduction | Yes — confirm CPD is Phase 2 |
| C-02 | Student profile holds `assigned_mentor` and placement dates (§8) | Those belong to Placement; students hold many placements over time | Structural, no scope change | No |
| C-03 | "Student feedback visibility" listed as an open decision (§19) | Resolved as a **blocking** dependency: manager/coordinator read individual, mentor sees aggregate at n ≥ 3, anonymous routes to cohort/ward (POL-013, POL-014) | Decision requiring governance approval | **Yes — blocks pilot** |
| C-04 | Induction checklist is "completed when a student reports to the unit" (§11) | Additionally a hard gate: no `Active` placement, and therefore no session logging, until induction completes (INV-02, INV-05) | Strengthening of intent | Yes — confirm this is desired, since it can block a ward |
| C-05 | Escalation "restrict access to authorized reviewers" (§8) | Field-level: only the assigned reviewer, submitter, and Program Admin may read `description`/`action_taken`; reviewer may not be the subject; reads are audited (INV-13, WFR-008, WFR-032) | Strengthening | Yes — informs consent wording |
| C-06 | Offline support = "local draft saving and retry sync" (§12) | Retry implies idempotency keys, and late replays that no longer validate must be surfaced to the mentor rather than discarded (OD-09) | Newly surfaced UI requirement | Yes — adds a mentor-facing "unsynced" view |
| C-07 | Dashboard indicators listed as stored metrics (§9) | Computed projections, refreshed from events | Implementation, no scope change | No |
| C-08 | Ward has `maximum students` (§8) | Enforced as a hard invariant that blocks allocation (INV-16) | Strengthening | Yes — confirm hard block vs. warning |
| C-09 | "Escalation flag for serious placement concerns" in MVP scope (§5.1) | Full five-state reviewed lifecycle with conflict-of-interest rules | Scope *increase* in depth (not breadth) — justified by safeguarding criticality | Yes — acknowledge effort |
| C-10 | Pilot capacity negotiation between coordinator and hospital | Deliberately **not** an in-app workflow for MVP; `Cohort.planned_capacity` only (Stage 1 §9) | Scope reduction | Yes — already recommended in Stage 1, confirm |

---

## 4. Disposition of the SADD v1.0

**Status: superseded by SADD v2.0.**

| SADD v1.0 section | Disposition in v2.0 |
| --- | --- |
| §1 Introduction, scope, constraints | Carried forward, updated to reference the design sequence |
| §2 Actors | **Corrected** — six MVP actors; CPD Reviewer moved to Phase 2 |
| §3 Use cases | **Superseded** by Stage 3.5, which specifies all eight workflows with guards and sequence |
| §4 Domain model | **Corrected** — Placement aggregate with assignment sub-entities; ownership reparented |
| §5 Data design (ERD, dictionary, indexing) | **Superseded** by Stage 5 (Database Architecture v1.0), which replaces it in full |
| §6.1–6.2 Architecture, cross-cutting | Carried forward, with the outbox and per-request scope resolution corrected in |
| §6.3 REST API | **Superseded** by Stage 6 (API Design v1.0), which replaces it in full |
| §8.1–8.2 Information architecture and UI principles | **Superseded** by Stage 7 (UI/UX v1.0) |
| §6.4 Auth & RBAC | **Corrected** — server-side scope resolution, field-level restrictions, 404-not-403 |
| §6.5 Non-functional requirements | Carried forward unchanged — held up well |
| §7 Information architecture & UI | Carried forward, plus the mentor "unsynced logs" view (OD-09) |
| §8 Workflows | **Superseded** by Stage 3.5 |
| §9 MVP backlog & acceptance | Carried forward, with acceptance criteria strengthened to include invariant enforcement |
| §10 Risks & open decisions | **Replaced** by the consolidated Open Decisions Register (Stage 3 §13 + Stage 3.5 §12) |

Two sections are deliberately left as **provisional rather than fixed**: the data design and the API design.
Rewriting them now would mean doing Stage 5 and Stage 6 out of sequence, on the same instinct that produced the
original problem. They are labelled so no one builds against them by accident.

---

## 5. Stage 1 Errata

| # | Location | Issue | Correction |
| --- | --- | --- | --- |
| E-01 | §1, closing note | States the document "delivers Stages 1–2 in full" and that the Domain Model "follows in Stage 3" | It delivers **Stage 1**. The Domain Model is **Stage 2**. §10.2 of the same document states this correctly, so §1 is the error |
| E-02 | §1, twelve-step diagram | Two numbering systems coexist: the twelve design *steps* and the *stage* numbers used in document titles | Canonical map published in §6 below. Stage numbers are authoritative for document naming |
| E-03 | §5, actor table | Lists Notification Service as an actor alongside five human roles; the SADD lists seven actors | Six MVP actors: five human (Student, Clinical Mentor, Nurse Manager, University Coordinator, Program Administrator) plus the Notification Service system actor. CPD Reviewer is Phase 2 |

Everything else in Stage 1 stands. Its central conclusions — Placement as aggregate root, non-overlapping
institutional jurisdictions, and the data-ownership table — became the foundation of the Stage 3 authorization
model without amendment.

---

## 6. Canonical Design Sequence

One numbering scheme, to end the ambiguity flagged in E-02.

| Stage | Deliverable | Status |
| --- | --- | --- |
| Stage 1 | Business Discovery — ecosystem, actors, process, data ownership | ✅ Complete (v1.0 + errata §5) |
| Stage 2 | Domain Model — bounded contexts, aggregates, entities, value objects, events, lifecycle | ✅ Complete |
| Stage 3 | Business Rules & Domain Invariants | ✅ Complete (v1.1) |
| Stage 3.5 | Use Cases & Sequence Diagrams | ✅ Complete (v1.0) |
| Stage 4 | Module Architecture & Module Communication | ✅ Complete (v1.0) |
| Stage 5 | Database Architecture — schema, constraints, indexing, migrations | ✅ Complete (v1.0) |
| Stage 6 | API Design — transport, contracts, versioning, errors | ✅ Complete (v1.0) |
| Stage 7 | UI/UX — information architecture, screen states, offline affordances | ✅ Complete (v1.0) |
| Stage 8 | Development Sprints & Delivery Plan | ✅ Complete (v1.0) |

The twelve-step list in Stage 1 §1 remains a useful description of the *discipline*; the stage numbers above
are what documents are named after.

---

## 7. Consolidated Open Decisions

Eleven open decisions now exist across Stage 3 and Stage 3.5. Three block pilot activity and are the subject of
the accompanying stakeholder memo.

| ID | Question | Status |
| --- | --- | --- |
| OD-01 | Does a pause extend the placement end date? | **Resolved** — JKUAT, 30 Jul 2026. Extends `actual_end`, planned dates retained (POL-020). Stage 5 unblocked |
| OD-02 | Hard-block placements on incomplete mentor training? | Decided — default on, override with reason |
| OD-03 | Feedback visibility model and min-n threshold | **Resolved** — JKUAT, 30 Jul 2026. Manager and Coordinator read individual; mentor aggregates at n ≥ 3, applied per displayed figure, no attribute breakdowns (POL-013, POL-013a) |
| OD-04 | Nurse Manager boundary: facility or ward? | Decided — facility, ward as filter |
| OD-05 | Archive delay after completion | Decided — 30 days, configurable |
| OD-06 | What anonymous feedback attaches to | **Resolved** — JKUAT, 30 Jul 2026. Both modes supported; confidential is the default, anonymous attaches to cohort/facility/ward only (POL-014, POL-014a) |
| OD-07 | Who authorises early completion | Decided — Nurse Manager with reason, Coordinator notified |
| OD-08 | May a placement complete with a low-severity escalation open? | Decided — deferral override only, never for high severity |
| OD-09 | Late-arriving offline logs that no longer validate | Decided — retained and surfaced, never discarded |
| OD-10 | Should unconfirmed placements time out? | Decided — no, flagged for human follow-up |
| OD-11 | Early completion — Coordinator notified or consulted? | Decided — notified |
| OD-12 | Does the research evaluation require sex-disaggregated reporting? | **Open** — asked of JKUAT, 30 Jul 2026 |
| OD-13 | Adopt Postgres column-level grants so escalation content is database-restricted, not serializer-restricted? | **Recommended yes** before pilot go-live (Stage 5 §6.3) |
| OD-14 | Retention period for escalation `description` / `action_taken`? | **Open** — needs a governance answer rather than defaulting to forever |
| OD-15 | Does the evaluation need a stable pseudonymous student identifier across cohorts? | **Open** — if yes, model it explicitly rather than re-purposing UUIDs in exports |
| OD-16 | Add a token auth path now for a possible future native app? | **No** — the Concept Note defers native until the PWA is tested (Stage 6 §4.1) |
| OD-17 | Deliver large exports by emailed link rather than in-app download? | Revisit after the first cohort export is measured |
| OD-18 | May Coordinators read session free text on a placement with an open escalation? | Recommend **no** for the pilot — confirm with JKUAT (Stage 6 §10) |
| OD-19 | Do queued (unsynced) sessions count toward the mentor's "days since last session"? | Yes locally and labelled; server projections never count them (Stage 7 §6.3) |
| OD-20 | Does a student see the status of a concern she raised, and at what granularity? | Recommend state only, no reviewer notes — **needs JKUAT confirmation** |
| OD-21 | English-only pilot UI with Kiswahili after usability testing? | Yes per Concept Note §19; write copy for translation now |

**Consent and pilot data collection are no longer blocked by us.** OD-03 and OD-06 are settled, so the consent
wording can be drafted. What remains is the governance sign-off itself, which is JKUAT's and AfyaVentures' step,
and it must include the residual free-text patient-identifier risk as accepted rather than solved (Stage 3.5
§11).

---

*End of Document Reconciliation Record — Sinaps Technology / JHUB Africa. Confidential.*
