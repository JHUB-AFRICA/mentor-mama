# MentorMAMA domain implementation status

Reviewed 15 September 2026 against the product requirements, Stages 3–8,
module architecture, API design, backend modules, portal workspaces, and
verification evidence.

## Domain map

| Domain/module | Status | What is integrated | Remaining gap |
| --- | --- | --- | --- |
| Core platform | Complete for pilot foundation | PostgreSQL constraints/triggers, stable errors, audit, transactional outbox, idempotency, command reconciliation | Backup/restore and production security launch gates |
| Identity and accounts | Complete for pilot | Invitations, activation, password lifecycle, cookie sessions, allauth TOTP MFA/recovery, verified-email OTP fallback, scopes, capabilities, account status, profile/contact, preferences | Passkeys, SMS MFA, trusted devices, richer device management deferred |
| Institutions/onboarding | Mostly complete | Institutions, cohorts, enrolment, student CSV import, registration number/phone, student profile | No separate Institution Admin role exists; not in the approved role model |
| Facilities | Mostly complete | Facilities, wards, capacity ownership, mentor CSV import, facility-scoped mentors/managers, dedicated Nurse Manager mentor/ward/placement/report/safeguarding/activity pages | Deeper facility administration and capacity negotiation deferred |
| Placements | Core complete; final acceptance hardening remains | Coordinator creates, Nurse Manager allocates ward/mentor, release/invite, student confirmation/orientation, lifecycle, pause/resume, completion/archive/withdrawal, audit/history | Automatic placement matching is not implemented; allocation is manual. Dedicated terminal browser journey remains a release gate |
| Induction | Complete for pilot | Versioned checklist, required responses, notes, timestamps, sign-off, atomic activation, printable summary | Broader training/content catalogue is separate |
| Mentorship | Core complete | Assigned mentor session logging, notes, duration, follow-up, duplicate protection, offline queue, retry/reconciliation, no-patient-identifier guidance | Session correction UI and richer follow-up views |
| Assessments/feedback | Pilot-integrated | Final assessment, immutable confidence/experience records, confidential feedback, detached anonymous feedback, student submission UI, analytics-owned minimum-3 mentor aggregates, scoped/audited approved-feedback reads for coordinators and Nurse Managers | Richer reporting and feedback follow-up workflow |
| Safeguarding | Workflow complete; operational integrations remain | Concern raise, restricted metadata list, assigned-reviewer detail, finding/action/closure, external referral outcome, audit, idempotency, browser journey | Retention policy, named operational owner, notification routing, production restricted DB access |
| Notifications | Pilot implementation complete | Transactional outbox, Celery dispatch/retry, Mailtrap/provider adapter, signed delivery/bounce callback contract, opt-in weekly digest task, per-recipient inbox records, unread/read API, responsive role-workspace inbox popover, idempotent event materialisation, role-aware invitations, account security emails, placement assignment routing, confidential feedback routing, mentor follow-up routing, final-assessment handoff, safeguarding severity routing, and restricted-data-safe templates | Provider-specific Gmail/Outlook/mobile rendering QA and production delivery observability |
| Learning | Pilot implementation in progress | Programme-scoped modules, lessons, quizzes, scored attempt history, completion records, mentor progress API, `TrainingIncomplete` placement release gate, mentor learner UI, idempotent six-module catalogue seed, and configurable programme training gate | Richer reporting |
| Content | Pilot implementation in progress | Programme-owned library items, role-filtered published reads, Mentor/Student library navigation, Programme Admin draft authoring/publishing UI, immutable revision snapshots, idempotent writes, and audited writes | Media storage and publishing governance |
| Analytics/reporting | Pilot read-side slice complete | `GET /dashboard` indicators, interruption/facility/cohort/minimum-3 feedback projections, computed-on-read placement progress, scoped asynchronous CSV exports with signed downloads and audit records, health/readiness probes, refresh command/Celery cadence, branded monitoring table, mentor summary, participant progress card, and local/S3-compatible export storage boundary | Production bucket policy/credentials, lifecycle retention policy, broader analytics, learning/content progress |

## End-to-end product flow currently proven

```text
Programme Admin / Coordinator / Nurse Manager setup
  → cohort and student onboarding
  → placement creation
  → ward capacity admission and mentor assignment
  → placement release to student
  → student confirmation and orientation
  → mentor induction and activation
  → mentor online/offline session logging
  → student feedback or safeguarding concern
  → authorised safeguarding review and closure
  → final assessment
  → Nurse Manager completion
  → Programme Admin archive
```

The core pilot flow is integrated and proven through the browser suite. A full
production release still depends on notification routing, operational
safeguarding governance, retention/security controls, and the remaining launch
gates listed below.

## Domain-model rules to preserve

- `placements` is the aggregate owner and the only module allowed to change
  placement state.
- `induction`, `mentorship`, `assessments`, and `safeguarding` are
  placement-bound child contexts and call placement APIs for state/authority.
- Anonymous feedback remains structurally detached: cohort + facility + ward,
  never placement or student.
- Safeguarding narrative is restricted; lists, events, notifications, exports,
  and aggregate projections must never carry it.
- `analytics` and `notifications` are read-side/leaf modules. They consume
  events but do not decide domain authority or mutate domain records.
- Role-owned portal workspaces may share feature components, but capabilities
  and transition availability remain server-owned.

## Next implementation order

1. Complete the Learning domain: programme-level training policy controls and richer reporting.
2. Complete the Content domain: media storage and publishing governance.
3. Configure the S3-compatible export adapter with production bucket policy, credentials, and lifecycle retention.
4. Add feedback follow-up state/actions and verify safeguarding/feedback notification routing without narrative payloads.
5. Complete retention, restricted production DB access, accessibility,
   performance, backup/restore, and safeguarding-owner launch gates.
