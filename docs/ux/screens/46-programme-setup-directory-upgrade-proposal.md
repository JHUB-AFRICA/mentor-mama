# Programme setup and directory — UX upgrade proposal

**Status:** Implemented in source; authenticated acceptance remains pending  
**Audience:** Programme Administrator, product, design, and engineering  
**Evidence:** User-provided screenshots 1–6 and source review of the portal, API,
models, and domain rules. Live browser verification remains pending because the
development machine is below the documented disk-space verification gate.

## Executive recommendation

Programme setup already has a substantial base: identity settings, access-policy
information, institution/facility/ward lists, search, create/edit/archive flows,
capacity display, and guidance. The work now is to make this configuration
trustworthy and complete for the pilot.

## Implementation status

- Institution and facility create/edit now collect contact person, contact
  email, contact phone, and optional logo. Logos are validated, previewed in the
  directory, replaceable, and removable.
- Setup progress now checks active identity and active institution, facility,
  and ward records. It explicitly says these records do not verify pilot
  coverage, and access policy is described as system-managed rather than an
  administrator-completed task.
- Training policy helper copy now matches the release-time check in the
  placement workflow. Directory search includes contact details, and contact
  email/phone values open mail or phone handlers.
- Ward capacity display and reduction safety remain follow-up work: assignment
  occupancy currently counts unended assignments in the facility module while
  admission uses placement lifecycle states. Fixing that safely requires a
  placement-owned capacity command at the placement module boundary.
- Dialog focus trapping/restoration, inline validation, exact status filtering,
  and live browser acceptance are still pending.

Prioritise three corrections before calling setup reliable:

1. Make setup status describe administrator-owned configuration, not merely the
   presence of API data. The current `3/3` includes system-provided access policy
   data and does not check that wards or operational coverage are ready.
2. Make training-policy copy match its actual effect. The portal says the change
   affects new placements, while the placement service reads the current setting
   whenever any placement enters `Awaiting Student`.
3. Protect ward-capacity integrity. Show a consistent occupancy count and prevent
   an edit from lowering capacity below occupied placements, or explain and
   enforce an approved grandfathering rule.

Then complete the create forms using fields the API already supports, explain
how institutions, facilities, and wards relate, remove the misleading CSV upload
affordance, and improve validation and dialog behavior. Keep the existing
MentorMAMA navy, teal, mist, and restrained card language.

## Product context and role boundaries

The Programme Administrator configures one programme and manages its programme
directory. The programme contains institutions and facilities as separate
programme-scoped records. Cohorts belong to institutions; wards belong to
facilities. A placement joins a cohort's institution to a facility through its
ward. A facility is therefore **not a child of one university** and may serve
placements from more than one institution.

The Coordinator owns cohort and student onboarding within an institution. The
Nurse Manager operates mentors, wards, and placements within a facility. The
Programme Admin must not be led to believe that directory setup lets them
perform those role-owned operations on another user's behalf.

There is a contract conflict to resolve: the Stage 3 business rules say the
Programme Admin can configure institutions, facilities, and wards, while the
Programme Admin live-test plan says ward ownership and setup-readiness scope are
unresolved. The UI currently exposes ward creation, editing, and enable/disable
to the Programme Admin. Confirm this boundary before expanding those controls.

## Baseline before the directory update

| Area | Current behavior evidenced in source/screenshots | Limit |
| --- | --- | --- |
| Programme identity | Name, short name, description, academic year, programme owner, and mentor-training policy are loaded and saved through programme settings. Saving shows a toast and refreshes the settings query. | No saved/dirty state is visible in the supplied viewport; owner is labelled optional although the server resolves a missing owner to the current/previous Programme Admin. |
| Setup progress | Identity, directory, and access-policy data are shown as a `3/3` checklist. | Identity means a non-empty name; directory means at least one institution and one facility; access policy means the policy API returned any records. The institution/facility endpoints include archived records, so archived-only directory data can also count. It does not require a ward or verify operational coverage. |
| Access policy | Displays the server-owned capability policy for review. | This is not a setting that the Programme Admin configures; treating its presence as an administrator-completed task overstates progress. |
| Directory | Institution, facility, and ward tabs; counts; name search; creation; institution/facility editing and archive/restore; ward editing and enable/disable; ward capacity/allocated/available counts. | Create forms collect less metadata than edit forms and the API support. The facility-to-institution relationship and ward-capacity meaning are not explained. |
| CSV import | The card says a validated import contract is required and opens guidance. | The button is still labelled **Upload CSV**, but no file is selected or imported. |
| Guidance and modals | Guidance and create/edit/archive dialogs exist. Archive copy says historical references are retained. | The screenshots show native browser validation. The custom dialogs declare `aria-modal`, but source does not implement focus trapping, Escape handling, or focus restoration. |

## Findings from the supplied UI pass before the update

### Setup identity and progress — screenshots 1 and 2

- The top callout and right-side progress card repeat the same `Core setup checks
  complete`/`3/3` result. This takes space without explaining a new decision.
- The result can read as programme readiness, while its implementation checks
  record presence and policy API availability only. The callout's explanatory
  sentence is more precise than the green status headline.
- The training switch is a high-impact programme-wide policy. Its helper says it
  affects new placements and not existing placements. The server checks the
  current programme flag at the transition to `Awaiting Student`, including for
  placements created earlier. This difference needs a product decision and
  matching implementation/copy.
- The `Programme owner (optional)` select includes an empty option. The API
  accepts null but the update service falls back to the existing owner or actor;
  submitting an empty string is not a valid UUID. Either make this an explicit
  required steward field or define and implement how clearing ownership works.

### Directory — screenshots 3–6

- Add Institution and Add Facility ask only for a name. Their submit handlers
  send empty values for the other fields even though the API/model support
  institution type, county, contact person, and facility county, level, maternity
  unit name, and contact person. Edit forms expose these fields. This creates an
  avoidable edit-after-create step and leaves records less useful for scope
  review.
- The directory presents institutions, facilities, and wards without explaining
  that facilities are programme-scoped and independent of institutions. This is
  especially important because Coordinator access is institution-scoped and
  Nurse Manager access is facility-scoped.
- Ward creation defaults capacity to `1` and labels it “Student capacity” without
  explaining that capacity is a hard limit on placements in specified active
  lifecycle states. The server's admission check counts only its defined
  occupying states. The ward API's displayed `allocated_students` currently
  counts every unended ward assignment. Make the display and guard use one
  canonical occupancy definition.
- Ward editing allows a capacity reduction without checking current occupancy.
  The service updates `max_students` directly, so a lower capacity can leave a
  ward over its limit. Reject unsafe reductions or implement an approved rule
  that preserves existing placements while blocking new admissions.
- The empty Institution and Ward dialogs rely on browser-native required-field
  validation; screenshot 5 shows the browser's “Please fill out this field”
  bubble. Use the product's inline field error treatment and associate each
  message with its control.
- The Add Institution/Add Facility buttons are repeated in the table heading and
  Quick actions panel. This is usable but visually duplicates the same action;
  keep one prominent action and use the side panel for the next dependency-aware
  step.
- The “Upload CSV” button opens explanatory guidance rather than a file flow.
  Rename it to “Import guidance” or render import as a clearly disabled/future
  capability until validation, preview, partial failures, and audit behavior are
  implemented.
- In screenshot 3, the section content appears clipped under the fixed header.
  `scrollIntoView({ block: "start" })` is used for setup guidance without a
  visible fixed-header offset. Add an appropriate scroll margin and verify direct
  URL entry, tab changes, and browser back/forward.

## Prioritised upgrade plan

### P0 — trust and data-integrity corrections

1. **Replace the binary `3/3` claim with truthful states.** Separate:
   - Programme identity: not configured / configured / unavailable.
   - Directory records: counts by active and archived status; exclude archived
     records from active setup checks and state explicitly that counts do not
     confirm the pilot's required coverage.
   - Access policy: system-managed and available / unavailable, not a completed
     admin task.
   - Operational confirmation: only introduce a “reviewed for this pilot” state
     after the product defines who confirms coverage and how that confirmation is
     stored/audited. Until then use “Core records present” or “Review coverage”.
2. **Resolve and align training-policy behavior.** Choose whether the flag applies
   to all placements released after the setting change or only to placements
   created after it. Then make the server guard and UI helper consistent. Before
   changing a programme-wide policy, show its scope and the effect on pending
   placements; audit the change as today.
3. **Make ward capacity safe and consistent.** Use the same occupancy predicate
   for displayed allocation and admission. On capacity reduction, show current
   occupied count and prevent setting capacity below that count unless an
   explicitly approved grandfathering rule exists. Keep server validation
   authoritative.

### P1 — make directory setup complete and understandable

4. **Align create and edit fields.** The current create dialogs now include the
   metadata supported by the API, including the newly approved optional contact
   email, phone, and logo fields documented in ADR-0017:
   - Institution: name, type, county/location, contact person.
   - Facility: name, county/location, level, maternity-unit name, contact person.
   - Ward: facility, name, capacity, shift pattern, with capacity guidance.
   Keep optional metadata clearly optional. Public display of uploaded logos
   remains deferred until partner consent and publishing behavior are defined.
5. **Explain the directory relationships and next owner.** Show a small
   programme-specific relationship cue: institution → cohort (Coordinator),
   facility → ward (Nurse Manager operations), placement joins the two sides.
   State that facilities are programme-wide rather than assigned to a single
   institution. Keep this explanation short and close to the first create action.
6. **Make duplicate and scope errors recoverable.** There is no model-level
   uniqueness constraint or duplicate check for directory names in the current
   create path. Add a clear duplicate warning/check within programme scope and
   retain server-side scope validation. Allow a deliberate duplicate only if a
   legitimate same-name case is confirmed by the operator.
7. **Make unimplemented import honest.** Remove the Upload CSV action until the
   import contract is approved, or label it as guidance with no upload affordance.
   A real import later needs validation/preview, row-level errors, duplicate
   handling, idempotent retry behavior, and an audit result.
8. **Improve dialog validation and keyboard recovery.** Keep the navy/teal dialog
   styling, but add inline field errors, preserve entered values on API failure,
   move focus to the first invalid field, trap focus while modal, close on Escape,
   and restore focus to the launching action. Verify touch-sized actions and
   small-screen scroll behavior.
9. **Make archive impact clear.** Before archive, show the resource type/name,
   whether it has current wards or active operational references, what new work
   becomes unavailable, and that historical records remain. Keep the server
   authoritative for whether the archive is allowed.

### P2 — improve daily administration as directory size grows

10. Add explicit Active / Archived filters and search by the metadata people
    actually use (name, county/location, type/level, and facility for wards).
    Current searches are client-side and name-only; this is sufficient for a tiny
    seed dataset but weak for a growing programme directory.
11. Show `Active placements / hard capacity` in ward rows with a clear definition
    of the count, and a distinct “disabled” state. Do not use “available” to mean
    both active and capacity remaining.
12. Reduce duplicate setup chrome. Keep one primary progress summary and use the
    secondary column for the next useful action, field guidance, or decision
    context. Preserve the compact top callout when switching Directory/Access
    sections if it tells the user what that section is for.
13. Update the older UX contracts after decisions: `22-programme-settings.md`
    still documents name-only settings, and `23-programme-directory.md` still
    says ward/edit/archive flows are future work, although those are present in
    source.

## Proposed setup experience

1. **Identity:** confirm programme name and short name; collect only purpose and
   operating details with a defined downstream use. Show save state, validation,
   and what the training policy will affect.
2. **Directory map:** introduce the institution/facility distinction before
   asking for records. Guide the admin to add or review institutions and
   facilities, then wards if the ownership decision confirms this role owns that
   step.
3. **Record details:** use consistent create/edit forms and show active/archived
   state, location, contact person, and operational capacity only where the
   source model supports it.
4. **Review and handoff:** summarise configured record counts and coverage
   limitations. Offer the next valid step: invite a Coordinator with institution
   scope or a Nurse Manager with facility scope. Do not call the programme
   operationally ready solely because records exist.

Use the existing role-owned workflow boundaries: cohort creation and student
onboarding stay with Coordinators; mentor and ward-floor operations stay with
Nurse Managers. This proposal does not move those features into Programme setup.

## Product decisions to settle before implementation

1. What exactly qualifies as “core setup complete,” and who confirms that the
   listed institutions/facilities/wards match the pilot's operating scope?
2. Does the Programme Admin own ward creation, editing, capacity, and disabling,
   or does the Nurse Manager own some/all of those fields?
3. Does a training-policy change affect every future release, including already
   created unreleased placements, or only newly created placements?
4. Are type, county/location, and contact-person fields sufficient for the pilot,
   or are additional contact details required? Add fields only with an agreed use
   and privacy/data contract.
5. Is directory CSV import required for the pilot? If yes, approve its validation,
   duplicate, partial-success, rollback, and audit rules before exposing upload.

## Acceptance criteria for the upgrade

- The setup summary never marks a system-provided policy list as an admin-completed
  configuration task and never equates record presence with verified coverage.
- Policy copy and backend training gate apply to the same set of placements.
- Ward occupancy displayed to the user matches the server's capacity admission
  predicate; unsafe capacity reductions are blocked with a useful explanation.
- Create and edit can maintain the same API-supported metadata, and successful
  values remain after navigation/reload.
- Directory guidance explains the programme/institution/facility/ward model and
  directs the next action to the correct role-owned workflow.
- Import is either implemented end-to-end or clearly presented as unavailable.
- Validation and API failures preserve input and explain recovery; dialogs work
  with keyboard and assistive technology.
- Direct links, browser history, scrolling under the fixed header, and responsive
  layouts work at narrow, tablet, and desktop widths.

## Source references

- Screenshots: user-provided Programme setup/Directory images 1–6 in this
  conversation.
- [Programme settings contract](22-programme-settings.md)
- [Programme directory contract](23-programme-directory.md)
- [Programme Admin overview](18-programme-admin-overview.md)
- [Programme Admin first-use live test](45-programme-admin-first-use-live-test.md)
- [Domain invariants](../../architecture/stage3-business-rules-and-invariants.md)
- [Programme identity model/API](../../../backend/apps/identity/models.py),
  `ProgrammeSettingsSerializer`, `ProgrammeSettingsView`, and
  `update_programme_settings`
- [Directory UI](../../../apps/portal/src/features/programme-admin/ProgrammeDirectory.tsx)
  and [setup UI](../../../apps/portal/src/features/programme-admin/ProgrammeSettings.tsx)
- Institution/facility models and serializers under
  `backend/apps/institutions/` and `backend/apps/facilities/`; ward capacity
  admission in `backend/apps/placements/services.py`
