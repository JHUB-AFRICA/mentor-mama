# ADR 0008 — Anonymous feedback lives in its own table

**Status:** Accepted · **Date:** July 2026 · **Stage:** 5 (§6.2) · **Confirmed by:** JKUAT, 30 July 2026

## Context
POL-014 requires that anonymous feedback attaches to Cohort + Facility + Ward and never to a Placement or
Student, because a Placement identifies exactly one student — so "anonymous" feedback linked to a
placement is not anonymous. The obvious implementation is one feedback table with a nullable
`placement_id`.

## Decision
Two tables: `assessments_feedback_confidential` (placement-linked) and
`assessments_feedback_anonymous` (cohort, facility, ward, and submission date only). The anonymous
table has **no column** that could re-identify a student, no comments, and no exact timestamp.
Anonymous submission uses a dedicated endpoint with the placement ID in the request body only; the
command service uses it transiently to derive the approved aggregate dimensions. It returns no
feedback identifier and writes no actor-linked audit row, placement-linked outbox event, or generic
idempotency result reference. Replay protection stores only keyed digests of the command key and
payload plus the received date. A daily global counter retains only a coarse operational total.

Anonymous feedback is a fixed set of three 1–5 ratings. Reports expose ward-level aggregates to
Coordinators within their institution and Nurse Managers within their facility only after at least
three submissions. Comments and individual response rows are never returned by reporting.

## Consequences
- Anonymity is structural: there is nothing to join on and nothing to filter wrongly. It cannot be
  undone by a future query that forgets a `WHERE` clause.
- Anonymous responses cannot be traced to a placement for analysis, or followed up. Accepted by JKUAT.
- The date-only submission field, ratings-only contract, and digest-only command receipt reduce
  correlation through application metadata. Historical actor/result, audit, outbox, notification,
  comment, and exact-time links are scrubbed by migration `assessments.0004`.
- Anonymous scores live in their own timestamp-free response table; confidential feedback and
  assessment responses retain their existing timestamped table and behavior.

## Rejected
**One table with a nullable `placement_id`.** Anonymity would depend on every present and future query
remembering to exclude a column. That is a governance guarantee resting on developer memory.
