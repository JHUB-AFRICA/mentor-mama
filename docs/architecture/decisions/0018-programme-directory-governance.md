# ADR-0018: Programme directory ownership and coverage attestation

**Status:** Accepted for the pilot implementation  
**Date:** 2026-10-01

## Context

The Programme Admin setup flow needs a trustworthy handoff from configuration
to operations. Directory record counts alone cannot show that configured sites
represent the pilot's expected coverage. The role authority matrix assigns
shared programme configuration to Programme Admins, while Nurse Managers
operate placements within their facility scope. Ward occupancy is enforced by
placement lifecycle rules.

## Decisions

1. An active Programme Admin owns creation, editing, capacity, and archive or
   restore actions for the shared institution, facility, and ward directory.
   Nurse Managers retain facility-scoped operational access and cannot change
   shared ward configuration.
2. Ward occupancy display and admission use the placement-owned
   `OCCUPYING_STATES` set: orientation, induction, active, and paused. A ward
   capacity reduction below that count is rejected with a conflict response.
3. Pilot coverage is a human attestation by an active Programme Admin. The
   application stores reviewer and time and writes an audit event. It does not
   claim that record counts prove full coverage because no authoritative
   expected-sites dataset exists.
4. Any institution, facility, or ward create/update/archive/restore action
   clears the attestation. The admin must review and confirm again.
5. Programme owner is required and must be an active Programme Admin in the
   same programme. The setup form does not support an unassigned owner.
6. Directory duplicate detection is advisory. Exact same-name branches and
   campuses can be legitimate, so the UI warns but does not block creation.

## Consequences

- Setup progress separates active records from pilot coverage confirmation.
- Directory mutation paths depend on the identity public API to invalidate the
  attestation; the identity module does not query directory tables.
- CSV import and public partner logo publishing remain deferred. Public use of
  logos requires explicit partner consent and a production media policy.
- Migration `0013_program_directory_review` must be applied before the review
  state is available in a running database.

## Evidence and follow-up

The product-level authorization source is the Stage 3.5 authority matrix. The
pilot coverage confirmation is accountable but not independently validated.
If the programme later adopts an approved expected-sites roster, coverage can be
checked against that source instead of relying solely on the attestation.
