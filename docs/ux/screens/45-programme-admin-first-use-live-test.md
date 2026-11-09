# Programme Admin first-use workflow and live test plan

**Status:** Phases 1–3 and the read-only content readiness inspection have authenticated local acceptance evidence. Staff invitation email delivery and activation remain pending because development uses the console email backend. Content authoring, learner visibility, and publishing have not yet been accepted.  
**Audience:** Programme Administrator and product team  
**Related:** [Post-login journey](44-programme-admin-post-login-journey.md), [authentication lifecycle](../../architecture/authentication-and-account-lifecycle.md), [invitation scope](24-invitation-scope-assignment.md), [domain status](../../architecture/domain-implementation-status.md)

## Start with the real first-access model

For the current pilot, the bootstrap-admin path provisions the initial
Programme Admin account. In the current implementation this is a controlled,
one-time operational bootstrap command, not public self-registration. The
Programme Admin activates the invitation, verifies the email if prompted, sets
a password, enrolls mandatory TOTP MFA, saves the one-time recovery codes, and
then signs in with password plus MFA. The bootstrap/Operational Admin does not
become a Programme Admin and does not perform programme operations.

Future scope: design a dedicated Operational Admin dashboard for provisioning
and platform-level work so production setup does not depend on running
commands. That is a separate role and workflow; it is not part of today's
Programme Admin orientation test.

The live journey begins with a valid invited Programme Admin account and tests
activation/login as an entry phase. Do not create a second public-signup path as
part of this workflow.

## Intended first-use order

The dashboard is the entry point and task guide. It should not imply that every
menu item must be completed before the administrator can continue. The order
below follows real dependencies:

1. **Enter securely.** Activate the invitation, set credentials, complete
   required MFA, store recovery codes, then sign in. Land at `/admin` with no
   protected content exposed before MFA succeeds.
2. **Orient and confirm context.** On Overview, confirm the signed-in identity
   and programme name, understand the admin's boundaries, and inspect any
   setup/attention items. Loading or API failure must not be presented as
   “all systems operational.”
3. **Set programme identity.** Confirm or update the programme name and save.
   This gives subsequent invitations and portal context the right identity.
4. **Build the directory.** Add the institutions and facilities the pilot
   actually uses. Configure ward context where the current product contract
   allows it. These records are prerequisites for role-scoped invitations.
5. **Invite operational leads.** Invite each University Coordinator with an
   institution scope and each Nurse Manager with a facility scope. Confirm the
   chosen role/scope before sending. Verify pending status, delivery feedback,
   resend, and activation visibility. Coordinators then own student onboarding;
   Nurse Managers own facility mentor onboarding.
6. **Prepare programme learning/content.** Review the training policy and
   catalogue, then create/review/publish the content needed for the pilot
   audience. Confirm role visibility and publication state. Treat this as a
   pilot-readiness task when training/content is in scope, not as a prerequisite
   for account access or directory setup.
7. **Review operational work when it exists.** Open Placements and inspect the
   programme-wide list/detail and permitted actions. The usual operational
   handoff remains Coordinator creates the placement, Nurse Manager assigns
   ward/mentor, Student confirms, and Mentor completes induction and sessions.
   Programme Admin uses only explicitly granted lifecycle actions and must see
   the reason/prerequisite when an action is blocked.
8. **Use evidence and governance surfaces.** Review Reports and Activity once
   records exist; confirm filters, safe scope, exports and audit history. Empty
   states should tell the admin how to produce the first useful data.
9. **Finish with own-account controls.** Check profile, password/MFA, recovery,
   active sessions and notification preferences. These controls concern the
   signed-in user's own account, separate from managing other people's access.

Steps 3–6 establish a ready programme. Steps 7–8 are operational review and
should not be simulated as successful merely because a page renders. Step 9 is
available throughout and is not a gate to routine work after mandatory MFA.

## Phase-by-phase live test

| Phase | User action | Pass evidence | Record as a defect if |
|---|---|---|---|
| 0. Activation and sign-in | Open the bootstrap invitation; activate; set password; enroll TOTP; save recovery codes; sign out/in with MFA | Correct role and programme scope; secure, understandable handoffs; MFA enforced before workspace access | Public signup is offered; role/scope can be changed by the user; secrets/recovery codes leak; failed MFA exposes data; wrong landing route |
| 1. First landing | Arrive at Overview; inspect header, next action, attention and readiness; follow Operating context and Access policy links, then return | `/admin`; role/programme context is clear; first action matches the earliest unmet prerequisite; directory/access links open their matching setup section and URL; Back restores the previous section; loading/error states do not claim readiness | Fake green/zero state; unclear labels; dead action; card opens the wrong setup section; duplicate-invite prompt before access review; content lacks page context |
| 2. Programme identity | Open Programme setup, edit name, save, revisit Overview | Validation and saving state; success persists and is reflected in programme context; failure retains input and offers recovery | Name silently reverts; misleading success; whole app reload/context loss; no explanation of constraints |
| 3. Directory | Create the pilot institution and facility; inspect existing wards or ward setup | Correct records and ownership; scoped lists update; empty/error/duplicate/validation states are understandable | Facility cannot be tied to institution/programme correctly; users can create a scope that should not belong; ward responsibility is unclear; records disappear after navigation |
| 4. Staff access | Invite a Coordinator for an institution and Nurse Manager for a facility; inspect/resend each invitation | Role determines required scope; only valid in-programme scope accepted; confirmation shows what was sent; row status and resend reflect server state | Wrong/missing scope; ambiguous delivery result; duplicate invite; unsafe lifecycle action; lost search/filter/context |
| 5. Learning/content readiness | Inspect policy/catalogue; edit a draft; preview role visibility; publish if the pilot requires it | Audience and status are explicit; drafts do not appear to learners; publish/update result and revision are visible | Learner visibility is wrong; content can publish without expected checks; media/action appears supported but is not; content readiness is claimed without a real signal |
| 6. Placements handoff | Open placement list/detail; use a seeded eligible and ineligible record for permitted admin commands | Scope and current lifecycle are clear; allowed action succeeds; blocked action gives prerequisite/owner; audit/result is visible | Admin can bypass a role-owned step; illegal transition is offered or gives a vague error; reason/audit is missing; data is exposed outside programme scope |
| 7. Reports and activity | Open each view before and after seeded events; exercise filters/export where configured | Empty/loading/error states are distinct; filters and URL state remain coherent; exports show queued/ready/failed/expired; safe audit metadata only | No data is mislabeled as healthy; filters reset unexpectedly; restricted narrative leaks; export status/result is ambiguous |
| 8. Own account and return | Update own profile/preferences; inspect security/session controls; navigate away and return | Account changes are scoped to self; session/MFA actions explain consequences; returning to work preserves expected route/query state | Account controls change another user; sign-out leaves an active session; whole-page reload breaks navigation; route title/nav/back-forward disagree |

Run one phase at a time. At each phase, capture the starting account/record
state, action, visible result, final data state, and any recovery needed. Keep
test records clearly marked and never enter real patient information.

## Assumptions to validate with the Programme Admin

- The pilot has one programme per Programme Admin; programme context is a
  label, not a switcher.
- Programme name should be confirmed before staff invitations are sent.
- Institutions and facilities are created by Programme Admin before scoped
  staff invitations; invitees then onboard students/mentors within their own
  scope.
- Programme Admin should see operational signals and controlled fallback
  placement actions, but should not perform Student, Coordinator, Nurse
  Manager, or Mentor work on their behalf.
- Learning/content setup is a readiness activity when those features are in
  use; it does not gate sign-in or directory setup.
- Reports and Activity are useful after seeded/real programme events exist; an
  empty dataset is a valid state, not a failure.
- Own-account security belongs under Account settings, not the shared staff
  access workflow.

Ask the test participant to think aloud, but do not explain where to click
before the first attempt. Note the participant's expected next action before
comparing it with the interface. This distinguishes a wiring defect from an
information-architecture or wording problem.

## Known decisions and implementation gaps to keep visible

- The live test needs a prepared, valid account/invitation created through the
  current bootstrap-admin path. A future Operational Admin portal is separate
  scope and must not expand Programme Admin privileges.
- Ward administration and the exact split of setup readiness remain
  unresolved in the product contract; do not treat the current UI as proof of
  the approved ownership model.
- Content media storage and publishing governance remain incomplete.
- Production report storage/retention and safeguarding operational governance
  remain outside a local Programme Admin happy-path test.
- Source inspection is not acceptance evidence. Mark a capability “passed” only
  after its user action and resulting server/UI state have been observed.

## 2026-10-01 Phase 3 local acceptance

Using a separate Programme Admin test account and `.example.test` recipients,
the browser journey created a University Coordinator scoped to E2E School of
Nursing and a Nurse Manager scoped to E2E Teaching Hospital. Network request
payloads contained only the role-correct scope field; People & access showed
both as Invited with the expected scope; the Coordinator resend action queued a
fresh invitation. The development server uses Django's console email backend,
so no real messages were sent. Email delivery, activation-link use, and the
scope-prefilled handoff from the Overview checklist were not accepted in this
run. Repeatable journey: `apps/portal/e2e/program-admin-invitations-acceptance.spec.ts`.

## 2026-10-01 Programme Admin workflow continuation

Phase 3 staff access was accepted for invitation issuance: Coordinator uses an
institution scope; Nurse Manager uses a facility scope; both appear as Invited
with the expected scope; resend queues a fresh invitation. The Overview
operational-access checklist item intentionally opens People & access for review
instead of sending an invitation. Phase 3 implementation now adds role-specific
invite actions to the Getting started operational-access step, includes active
and pending counts separately for each operational role, and sends admins to
People & access to review pending invitations rather than automatically issuing
another invitation. Each invite action preselects its role. The admin explicitly
chooses the institution or facility; when only one active matching scope exists,
the form selects it automatically. The invite success notice names the role and
scope, explains that access remains pending until acceptance, and links directly
to invitation review. People & access labels the status “Invitation pending” to
avoid implying recipient acceptance or mail delivery.

The invitation dialog now provides initial focus, keyboard focus containment,
Escape close, and focus return to the trigger. Local browser checks cover these
behaviors at a 375 px viewport. Email delivery and recipient activation remain
unverified because local development writes email to the console backend.

The next learning/content phase received an inspection-only authenticated
browser pass. Programme setup displays the mentor-training release rule and its
helper text; Content library exposes audience/status filters, content types,
and current published/draft/archived states; the existing learning-module list
is filterable; navigating away and back leaves the policy unchanged. No existing
content was edited or published. Repeatable check:
`apps/portal/e2e/program-admin-content-readiness-acceptance.spec.ts`.
Pending before accepting the full learning/content phase: inspect a specific
draft and its role preview, author or edit a clearly marked test draft, verify
learner visibility, and publish only a pilot-approved item. Confirm ownership
and approval for actual programme materials before modifying them.

## 2026-10-01 Phase 3 invitation handoff enhancement acceptance

The repeatable authenticated journey
`apps/portal/e2e/program-admin-invitations-acceptance.spec.ts` passed with a
separate local Programme Admin test account at a 375 px viewport. It verifies
modal focus entry, wraparound keyboard navigation, Escape close and focus
restoration; Coordinator institution scope and Nurse Manager facility scope in
the invitation requests; role/scope-aware queued feedback; pending status and
scope in each person's detail view; Coordinator resend; and role-separated
pending counts in the Programme Admin summary response. A focused backend test
confirms those aggregate counts do not expose recipient email addresses.

The Overview-based shortcut gap was then checked using a separate, temporary
programme with one active institution, facility, and ward, no operational
leads, and no pilot-coverage attestation. At 375 px, Getting started appeared;
the Coordinator shortcut opened the invite dialog with Coordinator and the sole
institution selected, and the Nurse Manager shortcut selected Nurse Manager
and the sole facility. The responsive page had no horizontal overflow. The
synthetic programme, admin, and MFA device were deleted after the check. No
invitation was submitted during this browser pass.

Recipient delivery and activation remain pending. The local development
settings deliberately use Django's console email backend even though Mailtrap
Sandbox credentials are present in the local service environment. A scoped
attempt to send an activation message to the configured Mailtrap Sandbox was
rejected by the automatic approval review because the message contains an
activation credential and goes to a third-party service. No email or activation
link was sent. Continue only after explicit approval for that specific
sandbox-only message journey; do not use production email or a real recipient.
