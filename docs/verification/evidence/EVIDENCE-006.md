# EVIDENCE-006 — Facility-owned ward allocation

**Requirement(s):** Placement Management W-02, INV-16, INV-17, ADR 0015
workspace role boundaries.

**Platform:** Django/PostgreSQL integration tests and local Chromium portal
regression.

**Starting state:** Clean isolated `test_mentormama` database with institution,
facility, ward, cohort, enrolled student, coordinator, and nurse manager
fixtures.

**Journey and checks:**

1. Coordinator creates a placement for an enrolled student.
2. Nurse Manager allocates a ward from facility scope before the placement has a
   derived facility.
3. The service locks the ward, checks capacity, validates facility scope, and
   derives the placement facility.
4. Coordinator allocation is rejected by the server capability boundary.
5. Mentor assignment, system scheduling, induction, activation, and session
   invariants continue to pass.

**Observed result:** PASS — focused placement/API/invariant/institution suite
passed 64 tests; full backend suite passed with exit status 0; portal E2E passed
4 available journeys.

**Implementation:** `allocate_ward` is granted to Nurse Manager and Programme
Admin fallback. The frontend consumes the capability flag, and the backend
checks the selected ward facility before deriving `Placement.facility_id`.

**Known coverage:** Programme Admin MFA browser journey remains skipped without
a local enrolled authenticator secret. No production credentials or providers
were used.
