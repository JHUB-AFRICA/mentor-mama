# ADR 0008 — Anonymous feedback lives in its own table

**Status:** Accepted · **Date:** July 2026 · **Stage:** 5 (§6.2) · **Confirmed by:** JKUAT, 30 July 2026

## Context
POL-014 requires that anonymous feedback attaches to Cohort + Facility + Ward and never to a Placement or
Student, because a Placement identifies exactly one student — so "anonymous" feedback linked to a
placement is not anonymous. The obvious implementation is one feedback table with a nullable
`placement_id`.

## Decision
Two tables: `assessments_feedback_confidential` (placement-linked) and
`assessments_feedback_anonymous` (cohort, facility and ward only). The anonymous table has **no column**
that could re-identify a student. Its timestamp is a `date`, not a `timestamptz`.

## Consequences
- Anonymity is structural: there is nothing to join on and nothing to filter wrongly. It cannot be
  undone by a future query that forgets a `WHERE` clause.
- Anonymous responses cannot be traced to a placement for analysis, or followed up. Accepted by JKUAT.
- The date-only timestamp prevents correlating a submission against application logs.
- Two write paths in the assessment service, selected by mode; `assessments_response` carries a
  one-parent check constraint.

## Rejected
**One table with a nullable `placement_id`.** Anonymity would depend on every present and future query
remembering to exclude a column. That is a governance guarantee resting on developer memory.
