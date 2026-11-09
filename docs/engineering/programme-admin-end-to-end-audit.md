# Programme Admin end-to-end audit

**Date:** 2026-11-08  
**Status:** source fixes implemented; automated database and live journey acceptance pending

## Executive assessment

Programme Admin has a substantial working workspace, but it is **not fully
implemented and accepted end to end**. The main navigation and core setup,
people, placement, content, reporting, activity, and own-account surfaces exist.
The backend generally enforces role, active status, programme scope, capability,
and domain rules. Several administrator actions are missing from the UI, some
visible person-detail controls are placeholders, and one account-status API
transition is unsafe for invited users.

The approved account authority matrix in
`docs/architecture/authentication-and-account-lifecycle.md` is the permission
source for this review. Programme Admin has programme-wide authority, but that
does not permit bypassing activation, placement state, or domain invariants.

## Programme Admin action map

| Responsibility | Current implementation | Assessment |
| --- | --- | --- |
| Sign in and enter workspace | Required MFA, server-loaded capabilities, role route to `/admin` | Implemented; a current full activation-to-first-task acceptance is still missing. |
| Review programme status | Overview reads programme summary, indicators, readiness, activity, and invitations | Implemented core. Check each attention-card destination and ensure failed or partial data cannot appear healthy. |
| Manage people and invitations | Search, filters, pagination, scope-aware invite, resend, suspend/reactivate/deactivate, role/scope edit | Core exists. Programme Admin invitation is missing from the invite form; person activity and recovery controls are incomplete. |
| Configure programme | Programme identity, institution/facility/ward directory, import preview/commit, coverage attestation | Broad setup exists. Align the remaining ownership/readiness wording with ADR-0018 and product requirements. |
| Manage placements | Programme-wide read and explicitly granted create/release, ward/mentor allocation, pause/resume, complete, archive, and withdraw commands | Backend capability set exists; the full Programme Admin lifecycle path lacks a dedicated current end-to-end acceptance run. Domain guards must remain authoritative. |
| Manage learning/content | Content library, draft authoring, revision and publication commands | Implementation is in progress. Media storage and publication governance are open; test evidence is inspection-only, not author/publish/learner visibility. |
| Review reports | Programme analytics and scoped asynchronous exports | Pilot read/export slice exists. Production storage, retention, and broader analytics remain open. |
| Review activity | Programme-scoped paginated audit timeline | Implemented core. Verify filters and ensure safe audit metadata only. Per-person activity in the drawer is not wired. |
| Secure own account | Own profile, password, MFA, backup codes, sessions, recovery request, notifications | Core settings exist. These are distinct from staff-account administration. |
| Help another user recover | MFA recovery override service/view exists; a user can submit a recovery request | Incomplete workflow. There is no Programme Admin recovery-request inbox or person-level recovery action. The approved matrix also grants administrators session revocation, but the current session endpoints operate on the signed-in user's sessions only. |

Programme Admin deliberately does not receive mentor session logging, mentor
induction, student confirmation, student assessment/feedback submission, or
Coordinator/Nurse Manager feedback review. Programme-wide capability does not
override placement state and assignment rules.

## Findings

## Follow-up implementation (2026-11-08)

The high-priority source defects and connected Programme Admin controls have
been implemented. Pending invitation activation is rejected by the status
service, role/scope/email are included in invitation-token validation, and
unaccepted invitations must be reissued instead of having their access edited.
Programme Admin can now reissue a deactivated invitation that has not been
accepted. Status/access changes require a stated reason, and account lifecycle
writes lock the target record before validating and applying the change.

The People & access screen now includes a programme-scoped authenticator
recovery inbox, audited approve/reset or close actions, all-device sign-out for
an active account, a Programme Admin invitation option, and a real safe
per-person activity timeline. The Notes placeholder and nonfunctional row
selection controls were removed. A password-authenticated session can request
authenticator help before completing MFA; the request itself does not restore
access or expose backup codes. Emails contain only generic security notices.

Verification in this environment: TypeScript check, focused ESLint, Python
compile, Django system check, and `git diff --check` pass. The focused pytest
suite could not run because PostgreSQL was unreachable from the command
environment, and Docker commands are denied there. Live browser acceptance is
still required for the full invitation, recovery, session-revocation, and
activity journeys. This report therefore does not claim endpoint-by-endpoint
dynamic security acceptance.

### High priority

1. **Invited accounts can be changed directly to active through the API.**
   `change_status` accepts `active` for any same-programme target when called by
   a Programme Admin; it does not validate the prior status. Invitations have
   unusable passwords and `activate_user` requires `invited`, so this transition
   can strand an invitee who has not completed activation. The UI does not show
   this action for invited users, but the API accepts it. Add an explicit
   allowed-transition table and reject `invited → active` except through
   activation.

2. **Changing an invited user's role/scope leaves the old invitation valid.**
   `change_access` updates role and scope without rotating the invitation nonce
   or issuing a replacement invitation. The invitation token hash does not bind
   role/scope, so the previously delivered link can activate the updated role
   without the recipient receiving the new role/scope context. For invited
   accounts, reject access edits or invalidate and reissue the invitation with
   clear queued-delivery feedback.

3. **Administrator recovery authority has no complete operating workflow.**
   MFA recovery requests can be created, but there is no list/review/decision
   route for Programme Admins. A direct MFA recovery action exists and requires
   an audited reason, but People & access does not expose it. The authority
   matrix grants Programme Admins revocation of any user's sessions; the current
   revoke endpoints are self-only. Define and implement the request, review,
   reason, audit, notification, and target-session revocation journey.

4. **People detail can report “No recent account activity” without querying
   activity.** The Activity tab is static; the Notes tab is also a placeholder
   that says a notes contract does not exist. This can mislead an administrator
   into believing the account has no activity. Wire scoped safe account events
   or remove/label the tabs as unavailable until implemented.

### Medium priority

4. **Programme Admin invitation is absent from the UI.** The authority matrix
   says Programme Admin may invite all roles and the backend accepts a
   programme-wide Program Admin invitation, but `InviteMemberModal` offers only
   Coordinator, Nurse Manager, Mentor, and Student. Bootstrap supports the first
   administrator; the normal invitation flow cannot add another administrator.

5. **Consequential changes use canned reasons rather than the administrator's
   reason.** Account status actions send text such as “Programme Admin suspend
   action”; role/scope changes send a fixed “updated role and scope” reason.
   The audit row therefore records an action label, not the rationale. Ask for a
   short reason in the confirmation flow and require it for governed changes.

6. **Role/scope editing does not match its UX contract.** The People drawer
   exposes an Edit access form, while the People & access design says casual
   role/scope editing is not offered. The authority matrix permits Programme
   Admin governance, so this should be an explicit controlled operation with a
   reason, impact warning, and session revocation summary, not a casual edit.

7. **People selection checkboxes have no bulk action.** Rows can be selected,
   but the selection is not used to perform an operation. Remove the dead
   affordance or implement a safe bulk action with preview and partial results.

8. **Access policy copy suggests editable controls, but the policy is read-only.**
   The panel says “Define who can access…” while its switch-like controls are
   `aria-disabled`. Present the server-owned policy as a review surface and
   direct users to the correct governed action.

9. **The overview's staff count excludes the current administrator.** The
   summary intentionally excludes the signed-in admin from its people queryset,
   but the “Programme staff” label does not say it counts other people only.
   Clarify the label or include the current account in that metric.

### Product and release follow-ups

- Finish author/edit/publish acceptance with a clearly marked test item, learner
  audience checks, and approval ownership. Do not treat the current content
  inspection-only journey as acceptance.
- Run a Programme Admin placement lifecycle journey with allowed and blocked
  transitions, explanations, audit results, and programme-scope boundaries.
- Complete Reports and Activity acceptance for empty, loading, error, filters,
  export queued/ready/failed/expired, and privacy-safe metadata states.
- Keep the overview's programme-name context non-interactive unless programme
  switching is implemented; the current chevron can imply a selector.
- Reconcile old UX notes that still call ward setup partial with the accepted
  Programme Admin ownership and current directory API.
- Keep production export retention/storage and safeguarding retention,
  operational ownership, and restricted-data access as launch gates.

## Local run status

Two separate development processes are running:

- Portal: `http://localhost:5173/` (`pnpm --filter @mentormama/portal dev --host 0.0.0.0`)
- Backend stack: `docker compose -f docker-compose.dev.yml up`; API at
  `http://localhost:8000/`, PostgreSQL on `5433`, Redis on `6380`.

The portal returns HTTP 200 and `/health/live` returns `{"status":"ok"}`.
Redis's `appendonly.aof.74.incr.aof` had a malformed 146-byte tail. A
checksum-verified backup of the 47 MB Redis volume was made at
`/tmp/mentormama-redis-repair/redis-volume-before-aof-repair.tgz`; Redis's
repair tool truncated the invalid tail, validated the manifest, and the
container now reports healthy. The backup checksum is
`34692a824bbe74012e91e619969860dce7a734844f89edefc064d014810362d1`.

Disk cleanup reclaimed about 11 GB by clearing npm's package/npx caches and
Gradle's generated build/dependency cache. Project `node_modules`, source,
Docker images, containers, and volumes were preserved. The drive now has about
15 GB free (6%). Sinaps still blocks heavy verification at this level; no build
or end-to-end test suite was run in this pass. The existing dated acceptance
evidence remains historical and should be rerun against the current source.
