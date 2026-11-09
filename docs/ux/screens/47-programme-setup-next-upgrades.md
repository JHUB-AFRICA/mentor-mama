# Programme setup — next upgrade opportunities

**Status:** Phase 2 core directory setup is accepted in authenticated local browser runs: identity persistence; institution/facility/ward create and detail flows; contact and logo update/removal; pilot coverage review and reset; archive flows; and 375 px keyboard behavior. The explicit rejection path for reducing capacity below occupancy remains pending.  
**Role:** Programme Administrator  
**Evidence:** Source review of ProgrammeSettings, ProgrammeDirectory, directory
models/services/API, placement capacity rules, and the earlier screenshots in
`46-programme-setup-directory-upgrade-proposal.md`.

## Current state after the directory update

- Programme identity includes name, short name, description, academic year,
  owner, and the mentor-training release rule.
- Setup progress separates programme identity, active directory records, and a
  named Programme Admin's explicit pilot-coverage review. The review records
  actor/time and resets after directory changes; it remains a human attestation.
- Access policy is presented for review; permission rules are system-managed.
- Institutions and facilities support name, type/level, location, contact person,
  email, phone, and an optional logo. Create and edit use the same metadata
  fields. Directory rows expose the logo, email, and phone.
- Wards support facility, name, shift pattern, capacity, and archive/restore.
- Directory search covers name, type/level, contact person, email, phone, and
  county/location. Institution/facility tables have active, archived, and all
  filters; ward rows can be filtered by status. Exact duplicate names warn but
  remain allowed because branches and campuses can legitimately share names.
  CSV import now has type-specific templates, preview, row validation,
  duplicate warnings, and atomic commit using the existing directory services.

The directory review and contact/logo migrations are applied in the local
acceptance database. Portal TypeScript and production build pass. Three
unauthenticated browser checks pass (signed-out load, neutral password-recovery
confirmation, and inline invalid-login feedback). A separate Programme Admin
test account passed MFA login and the focused journeys in
`apps/portal/e2e/phase2-acceptance.spec.ts`,
`directory-create-acceptance.spec.ts`, `directory-write-acceptance.spec.ts`,
`directory-governance-acceptance.spec.ts`, and
`directory-responsive-acceptance.spec.ts`. These cover identity persistence,
directory record create/detail navigation, contact and logo save/removal, ward
prefill and archive, pilot coverage attribution and invalidation, occupancy
display at current capacity, and keyboard behavior at 375 px. The full set
passed sequentially. A direct browser test of the server rejecting capacity
below current occupancy remains pending; the guard is present in source.

## Implemented decisions

### P0 — unblock trustworthy setup and safe operation

1. **Ward capacity consistency and safety:** directory occupancy and placement
   admission now use `OCCUPYING_STATES` (orientation, induction, active,
   paused). A reduction below current occupancy is rejected with a conflict.
2. **Programme owner:** required and selected from active Programme Admins in
   the same programme.
3. **Pilot coverage:** active Programme Admin attestation with reviewer/time;
   any directory mutation clears it. This does not validate against an
   expected-sites source that the product does not currently have.
4. **Ward ownership:** Programme Admin configures shared directory; Nurse
   Managers operate placements within their facility scope.

### P1 — help the admin finish setup in the right order

5. **Complete the non-blocking setup checklist handoff.** Current dashboard
   links to identity, directory, operational access, and required training.
   The primary invite action preselects a likely Coordinator or Nurse Manager
   role from current counts; the admin still selects the institution/facility
   scope. The operational-access checklist opens People & access for review.
   A future improvement can explain scope coverage in context and offer a
   direct role-specific invite entry while preserving explicit scope choice.
   Suggested order:
   order: confirm programme identity and owner; add/review directory records;
   review access policy; invite a Coordinator with institution scope and a Nurse
   Manager with facility scope. Each step should link to the existing page and
   report its actual status. Keep coverage review separate from simple record
   counts.
6. **Make invite actions scope-aware.** From setup, let the Programme Admin
   start the existing invite flow with the right role and directory scope
   preselected. Explain that contact emails in the directory describe partner
   contacts and do not create portal accounts. Show the invite's acceptance
   status and a recovery path for expired invitations.
7. **Continue directory list refinement.** Status filtering and classification
   search are implemented. Add useful sorting if admins report a need; keep
   client-side filtering until programme size evidence justifies pagination.
8. **Improve duplicate guidance.** Exact same-name records now produce an
   advisory warning. A future enhancement can show matching location/type
   details to help distinguish branches without blocking valid entries.
9. **Improve form recovery and modal behavior.** Directory dialogs now support
Escape, focus containment, and focus restoration. Remaining work: replace browser-native required
   field bubbles with inline messages; validate email, phone length, and logo
   dimensions before submit; preserve all values on server errors; move focus to
   the first invalid field; support Escape, focus containment/restoration, and
   scrolling on short screens.
10. **Explain archive impact before confirmation.** Show what becomes unavailable
    for new work, identify active dependent wards or assignments where relevant,
    retain historical placement references, and offer a clear restore path.

### P2 — add only when the programme needs the scale or public use

11. **Directory import.** Add CSV upload only with template download, dry-run
    preview, row-level errors, duplicate resolution, partial-success rules,
    retry behavior, audit summary, and a way to undo or correct a bad import.
12. **Partner website publishing.** Keep uploaded logos private to programme
    workflows until a separate partner-publishing flow exists. That flow needs
    explicit partner consent, display name, website link, ordering, preview,
    withdrawal, alt text, and a production media-delivery policy. Uploading a
    logo in Programme setup is not consent to publish it.
13. **Additional partner profile fields.** Consider postal address, website,
    official organization ID, and preferred contact channel only after
    coordinators/Nurse Managers confirm the operational task each field supports.
    Keep personal contact details distinct from institution/facility-level
    contacts.
14. **Setup change history.** Provide a readable timeline for identity, directory,
    policy, and archive changes using redacted audit data. Avoid showing contact
    email, phone, or file content in audit views.

## Recommended delivery order

1. Exercise the server rejection for reducing ward capacity below current
   occupancy using an isolated fixture with at least two occupying placements.
2. Coordinator and Nurse Manager invitation role/scope issuance, pending state,
   and resend are accepted locally. Activation and real delivery remain pending
   under the console email backend.
3. Improve inline validation and archive impact guidance where live use shows
   gaps.
4. Revisit CSV import and public partner publishing only when operational
   evidence justifies them.

## Acceptance evidence for the next implementation slice

- Migration is applied to local PostgreSQL and reversible; API reads and writes
  the new columns after restart.
- A Programme Admin can create, update, replace, remove, and reload a contact
  record/logo. Invalid, oversized, or unsupported images receive a clear error.
- Contact data and logo file contents do not appear in audit payloads.
- Core setup progress excludes archived records and requires an explicit,
  attributable pilot-coverage review. The UI states that this is an attestation.
- The ward occupancy display and server-side capacity guard use one documented
  placement-owned rule.
- A setup checklist leads to role-correct invitation scopes without treating
  partner contact records as portal accounts.

## Programme Admin Phase 3 live acceptance note

The authenticated invitation journey passed for Coordinator + institution and
Nurse Manager + facility; People & access showed the expected pending records,
and resend queued a fresh invitation. The follow-up implementation adds
role-separated active/pending counts, role-specific Getting started shortcuts,
scope-aware confirmation, explicit pending-acceptance wording, actionable
post-submit review, and keyboard focus behavior in the invitation dialog. The
authenticated 375 px role/scope/resend journey and focused summary privacy test
pass. The shortcut view itself still needs browser review with incomplete setup;
this test programme already has active leads. Recipient delivery and activation
were not exercised because local development uses the console email backend.
See `docs/ux/screens/45-programme-admin-first-use-live-test.md` for phase status
and acceptance artifacts.

## Remaining product decisions and later work

- Who may transfer Programme ownership, and should transfer require the
  recipient's acknowledgement?
- Which roles can archive facilities that still have active wards/placements?
- Are there active partner-approved expected-site lists that can replace the
  human coverage attestation in a future release?
- What partner consent and production hosting policy is required before the
  website can display logos?
