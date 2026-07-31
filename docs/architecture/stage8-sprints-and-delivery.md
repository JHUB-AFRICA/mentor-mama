# MentorMAMA — Stage 8: Sprints & Delivery Plan

**A controlled path from validated skeleton to a safe pilot**

| Field | Detail |
| --- | --- |
| Product | MentorMAMA — Digital Mentorship Toolkit for Safer Midwifery Clinical Placement |
| Prepared by | Sinaps Technology — Bouric Okwaro Enos (Ric), Co-Founder & Team Lead |
| Document type | Stage 8 of the design sequence: Sprints & Delivery Plan |
| Builds on | Stages 1–7; walking-skeleton audit |
| Version | 1.0 |
| Date | 31 July 2026 |

---

## 1. Delivery Decision

The pilot is built as one complete mentor workflow, not as a collection of role dashboards:

```text
authorised mentor → assigned student → induction complete → log session
→ offline queue when needed → exactly-once sync or visible Needs attention
```

This is the first release candidate. Reporting, broad administration, exports, notifications, and advanced
analytics wait until this path works on a real ward-floor device. The server remains authoritative for scope,
capability, state transitions, retryability, and idempotency; the client never reimplements those rules.

### 1.1 Non-negotiable outcomes

1. A mentor can log a valid session in under three minutes; the observed median target is two minutes or less.
2. No session is silently lost: an offline or uncertain submission is either synchronised exactly once or remains
   visible in **Needs attention** with a plain-language reason.
3. A user outside a record's scope cannot infer that it exists.
4. Feedback visibility follows the approved decision: Ward Manager/In-charge and University Coordinator may read
   confidential individual feedback; mentors only see per-figure aggregates with at least three contributors;
   no mentor-facing demographic breakdown is allowed.
5. A pause records interruption date, resumption date, and controlled cause, then extends `actual_end` without
   changing the planned dates.

## 2. Current Baseline and First Gate

The walking skeleton is useful evidence, but it is not a pilot-ready application. The portal is a sign-in
placeholder and the mentor offline flow has not been implemented. The reusable PostgreSQL test database was stale;
`pytest --create-db` recreates only that disposable test database. A full clean run is a required baseline gate,
not a claim carried forward from an earlier run.

Before feature work, close these demonstrated backend gaps:

| Gate | Required result |
| --- | --- |
| **Atomic commands** | The domain write, audit record, outbox entry, and idempotency record commit together. Replays return the original result; a competing write returns an in-progress/replay result without double-applying the command. |
| **Service authorisation** | Every command service enforces actor capability and scope under the lock. UI flags and scoped views are never the authorisation boundary. |
| **Session guard locking** | The current placement state and assignment are locked and re-checked inside the session-write transaction. |
| **Lost-response contract** | `GET /commands/{command_id}` exists and proves whether a queued command committed without issuing another write. |
| **Baseline evidence** | Full tests, migration-drift check, import-linter contracts, and constraint-catalogue tests pass against a clean PostgreSQL test database. |

## 3. Sprint Plan

Sprint lengths are one to two weeks. A sprint cannot be called complete on a code demonstration alone: its stated
acceptance tests must pass and its relevant security checks must be reviewed.

| Sprint | Outcome | Scope | Exit criteria |
| --- | --- | --- | --- |
| **0 — Trustworthy foundation** | Writes are safe to retry and permission checks are server-owned. | Baseline recreation; atomic idempotency/audit/outbox; service-level capabilities; placement/session locks; command-status endpoint; CI test gates. | All baseline gates in §2 pass; role-negative, replay, and lost-response tests pass. |
| **1 — Placement access** | Real staff reach only work they are allowed to do. | Secure cookie sign-in/out; `GET /me`; scoped assigned-student reads; placement create/allocate/assign; transitions endpoint consumed by the client. | Coordinator and Ward Manager/In-charge can set up a placement; a mentor sees only assigned students; cross-scope list/detail/command matrix passes. |
| **2 — Mentor core loop** | A mentor records a real teaching interaction quickly. | Portal shell and routing; Today and Students; placement detail; induction checklist; five-tap session form; server-side session validation. | An inducted assigned mentor logs exactly one valid session; inactive, paused, uninducted, out-of-window, and unassigned attempts fail with mapped domain codes. |
| **3 — Offline and Unsynced** | Connectivity loss cannot erase mentor work. | Durable local drafts; form-open idempotency key; command queue; retry from `retryable`; local session projection; Needs attention and reconciliation. | Network-loss, timeout, duplicate submit, and lost-response scenarios result in one server record or a visible unsynced item—never silent loss. |
| **4 — Placement lifecycle** | Staff can operate and close placements safely. | Invite/confirm; pause/resume; interruption reporting; final assessment; completion blockers; withdrawal/archive. | Pause records dates and cause, updates `actual_end`, and blocks session logging; blocked completion uses server-provided reasons. |
| **5 — Feedback and safeguarding** | The approved student-safety model works in the product. | Confidential/anonymous feedback; min-3 aggregates; restricted concern path; audited sensitive reads; feedback and escalation access tests. | Anonymous feedback has no student/placement link; only approved roles read confidential feedback; mentors cannot re-identify a student through a breakdown. |
| **6 — Pilot readiness** | A controlled, supportable pilot can launch. | Security hardening, accessibility, performance, training, support, backup/restore rehearsal, pilot usability study. | All §5 go-live gates pass; real-device mentor testing meets §1.1; named operational owners approve launch. |

## 4. Acceptance Test Matrix

Every scoped list endpoint is included in a parameterised isolation test. Every command gets an idempotency replay
test and, where network failure is plausible, a lost-response reconciliation test.

| Scenario | Expected result |
| --- | --- |
| Mentor submits while online | One session, audit entry, and outbox entry commit atomically; confirmation is shown. |
| Mentor submits with no signal | A local queued row remains visible immediately; no work is discarded. |
| Server committed but response was lost | The client reads command status, marks the queued item synced, and issues no second write. |
| Placement paused before retry | The item remains in Needs attention with `PlacementNotActive`; it is not silently accepted or deleted. |
| Same key sent twice | The original result is returned and only one domain record exists. |
| Same key for another command | `409` with the documented idempotency-conflict code. |
| Cross-institution list/detail/command | List is empty; detail and command return `404`; restricted text is absent. |
| Mentor aggregate has fewer than three contributors | No figure or demographic breakdown is displayed. |
| Pause/resume | Start, resumption, actor, reason, and duration are reportable; `actual_end` changes by the duration only. |

## 5. Pilot Go-Live Gates

### 5.1 Product and quality

- Observed median session-log completion time is at most two minutes; no observed task exceeds three minutes
  without a documented usability fix.
- At least 90% of observed mentors complete the core log task without assistance.
- All offline, timeout, lost-response, duplicate, and invalid-late-retry scenarios meet the acceptance matrix.
- Accessibility checks cover labels, keyboard flow, contrast, target size, loading, empty, error, queued, blocked,
  and success states.

### 5.2 Security and operations

- Session cookies are `Secure`, `HttpOnly`, and `SameSite`; CSRF, CORS, rate limits, request-size limits, and
  `Cache-Control: no-store` for scoped data are verified in the deployment configuration.
- Production reporting credentials cannot read escalation `description` or `action_taken` (OD-13).
- Escalation-content reads, individual-feedback reads, and exports are audited and tested.
- Backup and restore are rehearsed against a scratch database; operational contacts and an incident process exist.

### 5.3 Governance

- JKUAT/AfyaVentures approve participant consent wording and data-governance sign-off, including the residual risk
  of patient identifiers in free text and the redaction/incident procedure.
- A retention and disposal/review policy for escalation `description` and `action_taken` is approved (OD-14).
- A safeguarding operational owner and response process are named.

### 5.4 What needs sign-off, in plain English

These are approvals to operate the pilot safely, not requests to redesign the product. The three original design
questions are already settled: confidential feedback is the default with an anonymous option, mentors see only
min-3 aggregates, and interruptions are recorded and extend the actual placement end date.

| Sign-off | What the approver is agreeing to | Who should approve |
| --- | --- | --- |
| **Consent and data governance** | Students and mentors will be told who can read confidential feedback, what anonymous feedback cannot be used for, and that free-text fields must never contain patient identifiers. The programme accepts that warnings and redaction reduce—but cannot eliminate—the risk of someone typing an identifier. | JKUAT and AfyaVentures |
| **Safeguarding-text retention** | The programme sets how long concern descriptions and actions are kept, who reviews them at the end of that period, and whether they are deleted or retained under an approved policy. | JKUAT and AfyaVentures |
| **Restricted database access** | The production database is configured so reporting users cannot read the sensitive text of a concern, even if an application bug exists. This is the recommended technical protection in OD-13. | Sinaps implements; programme owners approve it as a go-live requirement |
| **Safeguarding response owner** | A named person/team receives and acts on concerns, with an agreed escalation route and response process. The app records and restricts concerns; it cannot provide the human response. | JKUAT and participating facilities |

No additional decision is needed to begin Sprints 0–4. These approvals are required before inviting pilot
participants or collecting pilot data.

## 6. Deliberately Deferred

- Native application/token authentication path (OD-16).
- CPD/content-reviewer role, regulator integration, co-mentorship, and in-app ward-capacity negotiation.
- Advanced dashboards, large-export delivery, and broad analytics beyond pilot reporting.
- Sex/gender collection unless JKUAT confirms it is needed for research reporting (OD-12).
- Longitudinal pseudonymous research identifiers unless required by the evaluation (OD-15).
- Coordinator session-free-text access during an escalation unless JKUAT explicitly overturns the recommended no
  (OD-18), and student concern-status details beyond state-only unless confirmed (OD-20).
- Kiswahili UI until English-pilot usability evidence informs the next iteration (OD-21).

## 7. Ownership and Cadence

| Responsibility | Owner | Evidence |
| --- | --- | --- |
| Product scope, consent, and safeguarding decisions | JKUAT / AfyaVentures | Signed decision and governance record |
| Architecture, implementation, and release engineering | Sinaps Technology | Reviewed pull requests, CI, migration and deployment evidence |
| Ward-floor usability validation | Nurse mentors and JKUAT clinical leads | Moderated test notes and timing results |
| Security and launch approval | Sinaps Technology with programme owners | Security checklist, restore rehearsal, launch checklist |

Weekly delivery review: demonstrate the completed vertical slice, review acceptance-test evidence and unresolved
risks, and decide whether the next sprint starts. A failed acceptance gate returns to the owning sprint; it is not
accepted as technical debt for the pilot.

---

*End of Stage 8: Sprints & Delivery Plan — Sinaps Technology / JHUB Africa. Confidential.*
