# Platform administration: end-to-end plan

Status: **planned, not yet built** (except the foundation listed in §2). Owner: project lead. Drafted 2026-11-11.

This plan describes everything the platform administrator (the MentorMAMA operator, above every programme) must be
able to do, and how it should look and behave. It covers running the platform as a whole, not only accounts:
programmes, enquiries from the website, people and access, system health, logs and audit, releases and maintenance,
email, file storage, background jobs, settings and feature switches, announcements, security, data protection and
backups. Each capability lists its screens, API, data, guard rails and acceptance criteria, and is assigned to a
delivery phase (§16).

---

## 1. The role

|           |                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who       | The MentorMAMA operations team (Sinaps / JHUB Africa). Few people, and every one of them is known by name.                                                                                  |
| Where     | Their own sign-in at `/platform` (separate from the programme portal), with an authenticator app required.                                                                                  |
| Scope     | Every programme, and the platform itself. Not the content of care: platform admins never read session notes, feedback text, safeguarding concern details or assessment answers (see §13.4). |
| Principle | Operate the platform and unblock people, quietly and with a record. Every change has a reason, an audit entry and, where it affects someone, a notification.                                |

### 1.1 Sub-roles (Phase 3)

One role today (`platform_admin`). When the team grows, split it into permission sets on the same role rather than
new login types:

| Permission set          | Can                                                                                                       | Cannot                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Owner**               | everything, including adding/removing platform admins, security settings, maintenance mode, data deletion | —                                                          |
| **Operator**            | programmes, accounts, enquiries, announcements, jobs, email, storage views                                | add platform admins, change security settings, delete data |
| **Support**             | enquiries inbox, account look-up, resend invitations, MFA recovery, read-only system status               | suspend accounts, change programmes or settings            |
| **Auditor** (read-only) | audit trail, reports, exports of the audit trail                                                          | any change                                                 |

At least two Owners must exist at all times (the last Owner cannot be demoted or suspended).

---

## 2. What already exists (foundation)

Built and deployed (commits `e740c02`, `2438f47`):

- Role `platform_admin` with no programme; separate sign-in at `/platform`; MFA required; first sign-in forces a new password, then lands on the dashboard.
- Bootstrap: `manage.py predeploy` creates `admin@mentamama.com` once from `PLATFORM_ADMIN_INITIAL_PASSWORD` (no email).
- API `/api/v1/platform/*`: overview, system status, programmes (list/create), invite programme admins, invite platform admins, account directory (search, filter, paginate), suspend/reactivate with reason, revoke sessions, resend invitation, MFA recovery requests (approve/decline), activity feed.
- Portal workspace: Overview, Programmes, Accounts, Support (MFA recovery), Activity, with skeleton loading.
- System status checks: database, cache, background jobs, email, file storage (now probes the R2 bucket), AI.

Gaps this plan closes: the website's **Contact** and **Request pilot access** forms are not connected to anything
today (the form only shows "Thank you" in the browser; nothing is sent or stored — `apps/web/src/pages/Contact.tsx`).
There is no audit search/export, no programme lifecycle beyond create, no maintenance mode, no announcements, no
email/job/storage consoles, no settings or feature switches, and no data-protection tooling.

---

## 3. Information architecture (navigation)

Left navigation in the platform workspace, in this order. Badges show items needing action.

1. **Overview** — the "is everything fine, and what needs me" page (§4).
2. **Enquiries** `•3` — website contact and pilot-access requests (§5).
3. **Programmes** — every programme and its lifecycle (§6).
4. **People** — every account across programmes, platform admins, invitations (§7).
5. **Support** `•1` — MFA recovery, sign-in problems, help requests from inside the portal (§8).
6. **Announcements** — messages shown in the portal and/or emailed (§9).
7. **System** — health, background jobs, email delivery, file storage, releases, maintenance (§10–§11).
8. **Audit & logs** — searchable audit trail, security events, exports (§12).
9. **Settings** — platform settings, feature switches, security policy, data retention (§13–§14).

A global search box (top bar) finds programmes, people (by name/email), enquiries and audit entries by id.

---

## 4. Overview (dashboard)

Purpose: in ten seconds, know whether the platform is healthy and what is waiting.

- **Needs attention** list, most urgent first: new enquiries, pending MFA recovery, failed emails (last 24 h), dead background jobs, storage or service checks not OK, programmes with no active admin, invitations expiring in 48 h, accounts locked out.
- **Health strip**: one chip per check (Database, Cache, Background jobs, Email, File storage, AI) with state and last-checked time; click opens System.
- **Numbers** (with 7/30-day trend): programmes active, people active by role, sign-ins, new enquiries, modules completed, emails sent/bounced.
- **Recent activity**: last 10 platform-level actions.
- **Release**: current version (git commit), deployed at, link to release notes.

Acceptance: loads in < 1 s with skeletons; every number is a link to the filtered list behind it; nothing on the page reveals care content.

---

## 5. Enquiries inbox (website "Contact" and "Request pilot access")

### 5.1 Website changes (apps/web)

- **Contact form** (`/contact`): name, email, organisation (optional), topic (General question / Partnership / Press / Technical support / Other), message, consent checkbox ("MentorMAMA may contact me about this enquiry"). Posts to the API; shows a real success or a clear error with a retry; keeps the typed text on error.
- **Request pilot access** (its own page `/pilot`, linked from every "Request Pilot Access" button, which today all point to `/contact`): contact person, role/title, email, phone, organisation type (Training institution / Health facility / County or ministry / NGO / Other), organisation name, county, number of mentors, number of students per cohort, preferred start term, maternity units involved, message, consent.
- Spam protection without hurting people: hidden honeypot field, a minimum fill time (e.g. 3 s), per-IP and per-email rate limits (e.g. 5/hour), server-side validation; Cloudflare Turnstile optional (setting) if spam appears. No CAPTCHA by default.
- Accessible: labelled fields, errors announced (`aria-live`), works without JavaScript errors on slow mobiles; the website stays a static site.

### 5.2 API and data

Public, unauthenticated, CSRF-exempt but origin-checked (`Origin` must be the website domain), rate-limited:

```
POST /api/v1/public/enquiries        { kind: "contact" | "pilot", ...fields, website: "" (honeypot), started_at }
→ 202 { data: { reference: "ENQ-2026-0042" } }
```

Model `platform.Enquiry`: `id`, `reference` (human-friendly, sequential per year), `kind`, `status`
(`new` → `in_progress` → `waiting_on_them` → `converted` | `closed` | `spam`), `priority`, contact fields,
organisation fields, pilot fields (JSON for forward compatibility), `message`, `consent_at`, `source_page`,
`ip_hash` (salted hash, for rate limiting only), `user_agent` (truncated), `assigned_to` (platform admin),
`converted_programme` (FK, nullable), `first_response_at`, `closed_at`, timestamps.
Model `platform.EnquiryNote`: internal notes and a log of replies (author, body, `is_reply`, sent email id).

Platform API:

```
GET  /api/v1/platform/enquiries?status=&kind=&assigned=&q=&page=
GET  /api/v1/platform/enquiries/<id>
POST /api/v1/platform/enquiries/<id>/assign        { user_id | null }
POST /api/v1/platform/enquiries/<id>/status        { status, reason? }
POST /api/v1/platform/enquiries/<id>/notes         { body }
POST /api/v1/platform/enquiries/<id>/reply         { body }        # emails the enquirer via Resend, logged as a note
POST /api/v1/platform/enquiries/<id>/convert       { programme fields, admin fields }  # pilot → programme + admin invitation
GET  /api/v1/platform/enquiries/export?…           # CSV, audited
```

### 5.3 Behaviour

- On submit: store, send the enquirer an acknowledgement email with the reference ("We received your request …, we reply within 2 working days"), and notify platform admins (in-app badge + email to a configurable list, default all Owners/Operators). Emails go through the outbox (retries, delivery tracking) like every other email.
- Inbox screen: list with status tabs (New, In progress, Waiting, Closed), kind filter, search, assignee; unread rows bold; age shown ("2 days"). Detail panel: the submission, a timeline of notes/replies/status changes, actions (Assign to me, Reply, Mark as spam, Close, Convert to programme).
- **Convert to programme** (pilot requests): pre-fills the Create programme form from the request and invites the contact as Programme Admin in one step; the enquiry links to the new programme.
- Service level: enquiries without a first response after 2 working days appear in Overview "Needs attention".
- Retention: closed enquiries kept 24 months, spam 30 days, then deleted by a scheduled job (setting, §14).

Acceptance: a submission on the live website appears in the inbox within seconds; the enquirer receives the acknowledgement; a reply from the inbox reaches them and is shown in the timeline; converting a pilot request creates the programme and sends the admin invitation; spam and rate-limit tests pass; nothing is lost if email is down (stored first, email retried).

---

## 6. Programmes

Lifecycle: **Setting up → Active → Paused → Closed → Archived** (and **Deleted** only via §13.5).

| Action           | Effect                                                                                                                                        | Guard rails                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Create           | name, short name, academic year, description, country/county, contact; optional first admin invitation                                        | unique short name                                                           |
| Edit details     | as above                                                                                                                                      | audited with before/after                                                   |
| Pause            | people can sign in and read, but no new placements, sessions or invitations; banner shown in that programme                                   | reason required; programme admins notified                                  |
| Resume           | back to Active                                                                                                                                |                                                                             |
| Close            | read-only for everyone; sign-in shows "This programme has ended"; exports still possible for its admins for 90 days                           | reason + type-the-name confirmation                                         |
| Archive          | hidden from lists; data kept per retention                                                                                                    | only after Close                                                            |
| Programme admins | list, invite, resend, remove admin rights (not delete the person)                                                                             | a programme must keep ≥ 1 active admin unless Closed                        |
| Limits (quotas)  | optional caps: active students, storage GB, AI requests/month                                                                                 | warning at 80 %, block at 100 % with a clear message to the programme admin |
| Health card      | people by role and status, last activity, setup checklist state (directory attested, modules published, cohorts), storage used, email bounces | read-only aggregates, no care content                                       |

Screens: list with status filter and search; programme detail page with tabs **Summary · Administrators · Usage · Settings · Activity**.

API (additions): `PATCH /platform/programmes/<id>`, `POST /platform/programmes/<id>/status`, `GET /platform/programmes/<id>` (detail + usage), `DELETE /platform/programmes/<id>/admins/<user_id>`, `PUT /platform/programmes/<id>/limits`.

Data: `Program.status`, `status_changed_at`, `status_reason`, `limits` (JSON), `contact_*`.

---

## 7. People and access

Already: directory, suspend/reactivate, revoke sessions, resend invitation. Add:

- **Person detail drawer**: profile, programme, role, status, MFA state (on/off, method, last used), last sign-in, active sessions (device, approximate location, started), invitation history, recent security events (§12.2). No care content.
- **Actions**: resend invitation; cancel invitation; reset MFA (only through the recovery flow in §8, or directly by an Owner with reason, which also revokes sessions); send password-reset email; force password change at next sign-in; revoke one session or all; suspend/reactivate; change email (sends confirmation to both addresses); move a person to another programme (Owner only; audited; rare).
- **Bulk**: select many → resend invitations, suspend, export CSV.
- **Platform admins** tab: list, invite, change permission set (§1.1), remove; last-Owner protection.
- **Invitations** tab: all pending invitations across programmes, expiry, resend/cancel in bulk.
- **Lockouts**: see accounts throttled by failed sign-ins; unlock with reason.

Guard rails: platform admins cannot be managed by programme admins (already enforced); every action requires a reason when it removes access; the person is emailed when their access changes (suspended, MFA reset, email changed).

---

## 8. Support

- **MFA recovery** (exists): add identity-check checklist (what was verified, how), and SLA timer.
- **Help requests from inside the portal**: a "Get help" link in the portal user menu opens a short form (topic, message, optional screenshot upload to R2 under `private/support/`). Arrives in Support with the person's account context attached (programme, role, browser, app version). Same timeline/notes/reply tools as Enquiries (shared component and model base).
- **Sign-in problems**: from the sign-in page "Can't sign in?" → a public form (email + description) that creates a support request without revealing whether the email exists.
- Canned replies (saved responses) for common answers.

---

## 9. Announcements

- Create a message with title, body (plain formatting), severity (info / warning / critical), audience (everyone, selected programmes, selected roles), channel (portal banner, dashboard card, email), schedule (start/end), dismissible or not.
- Preview as each role; send a test email to yourself.
- Planned maintenance announcements are created automatically from §11.2.
- Audit: who published, when, audience size; delivery stats for email.

API: `/platform/announcements` CRUD + `/publish`, `/archive`; portal reads `GET /api/v1/announcements/active`.

---

## 10. System health and operations

### 10.1 Health (extends today's status checks)

Each check shows state, a plain-language detail, response time and history (last 24 h sparkline): Database (connections, size), Cache, Background jobs (worker heartbeat, scheduler heartbeat, queue length, oldest waiting), Email (provider, last success, bounces/complaints 24 h, webhook connected), File storage (bucket reachable, credentials valid, objects/bytes used, files still on the old disk), AI (configured, last error, monthly usage vs cap), Website and portal reachability (HTTP check), TLS certificate expiry (custom domains).

### 10.2 Background jobs

- Queues view: waiting, running, failed, dead (outbox `dead_at`), per task type; oldest age.
- Dead-letter list with error code (never message bodies or personal data); actions: **retry**, **retry all of this type**, **discard with reason**.
- Scheduled tasks list (beat): name, schedule, last run, next run, last result; "run now" for safe tasks (digests, cleanup).

### 10.3 Email delivery

- Delivery log from Resend webhooks: recipient (masked unless clicked, audited), template, status (sent, delivered, delayed, bounced, complained), time. Filter by programme, template, status.
- Suppression list (bounced/complained): view, remove after fixing the address.
- Domain status (SPF/DKIM/DMARC as reported by Resend), sender address, test send.

### 10.4 File storage (Cloudflare R2)

- Bucket, endpoint, prefix; reachability; usage by type (documents, covers, lesson images, logos, exports) and by programme.
- **Migration helper**: files still served from the old disk; button to run the copy (`copy_media_to_object_storage`) as a background job with progress; "safe to remove disk" indicator.
- Orphan finder: objects in the bucket not referenced by any record (report first, delete with confirmation).
- Exports: list of generated exports, size, expiry; purge expired.

### 10.5 Data and backups

- Database backups: last successful backup (Render managed Postgres provides daily backups / point-in-time recovery on paid plans), retention, "how to restore" runbook link. A weekly restore test is recorded here (manual tick with notes until automated).
- R2: bucket versioning/lifecycle state; exports lifecycle rule (delete after 7 days).

---

## 11. Releases, upgrades and maintenance

### 11.1 Releases

- Current version (git commit, deploy time) for API, worker, scheduler, portal and website; warn when they differ (a partial deploy).
- Release notes: a short, human list per release (from `docs/operations/releases/*.md` or a `CHANGELOG`), shown here and optionally as an announcement ("What's new").
- Migration status: applied vs pending migrations (pending should always be none after predeploy).
- Dependency/security notices: weekly CI job output (pip-audit, npm audit) summarised here.

### 11.2 Maintenance mode

- Schedule a maintenance window (start, expected duration, message) → automatic announcement 24 h and 1 h before.
- Modes: **read-only** (sign-in and reading work; all writes return 503 with the maintenance message) and **full** (portal shows the maintenance page; health endpoints and platform sign-in still work so admins can turn it off).
- Implemented as a cached flag checked by middleware; platform admins are exempt; turning it on/off is audited and requires a reason.

### 11.3 Upgrades

Upgrades are deployed by git push to `develop` (Render auto-deploy). The console does not deploy code; it shows what is running, what changed, and whether checks passed after the deploy (post-deploy smoke checks: health, sign-in page, a read API).

---

## 12. Audit trail and logs

### 12.1 Audit trail (exists as `core.AuditEntry`; add the console)

- Search by actor, action, entity type/id, programme, date range, free text in non-sensitive fields; saved filters.
- Entry detail: actor, role, programme scope, action, entity, before/after for settings and status changes (never care content), request id, IP hash, user agent.
- Export CSV/XLSX of a filtered view (the export itself is audited); retention per §14.
- Integrity: append-only at the database level (no update/delete grants for the app role) and a daily hash chain checkpoint so tampering is detectable.

### 12.2 Security events

Separate filtered view: sign-ins (success/failure), MFA set-up/reset, password changes, lockouts, session revocations, permission changes, platform-admin actions, exports of personal data. Alerts (email to Owners) for: repeated failed platform sign-ins, a new platform admin, MFA reset of a platform admin, maintenance mode toggled, bulk suspension.

### 12.3 Application logs

Logs stay in Render (and Sentry if configured); the console links to them with the request id. It does not copy raw logs (they may contain personal data). Error rate and top error codes (last 24 h) are shown from structured log counters.

---

## 13. Security and data protection

### 13.1 Security policy settings

Session lifetime and idle timeout per role; MFA required for which roles (platform and programme admins always); password policy; sign-in throttling thresholds; optional IP allow-list for `/platform` (Owner only; with a lock-out safety: the current IP must be in the list to save).

### 13.2 Read-only "view as" (impersonation)

To reproduce a reported problem: start a **read-only** view of the portal as a named person, with a mandatory reason and a time limit (15 min). A banner shows it at all times; all writes are blocked; the person can see in their account activity that support viewed their account; every page viewed is audited. Never available for safeguarding queues, session notes or feedback text, even read-only.

### 13.3 Data subject requests

Find a person's records across modules; export their personal data (machine-readable) for an access request; anonymise on an erasure request where retention rules allow (keeps aggregate statistics, removes identity). Both need an Owner, a reason and a reference.

### 13.4 Care-content boundary

Platform admins see counts and states, never session free text, feedback text, safeguarding concern details or assessment answers. This is enforced in selectors (aggregate-only) and tested.

### 13.5 Deleting a programme

Only after Closed + export offered to the programme admins + 30-day wait; Owner only; two-person confirmation (a second Owner approves); removes personal data and files in R2 for that programme; leaves an audit tombstone.

---

## 14. Settings and feature switches

- **Platform settings**: product name/sender name, support email, enquiry notification recipients, default invitation expiry, default programme limits, retention periods (enquiries, audit trail, exports, deactivated accounts), enquiry SLA, Turnstile on/off.
- **Feature switches**: per platform and per programme (e.g. AI lesson explanations, Menta assistant, offline sessions, certificates, new placement workflow). Each switch shows who changed it and when. Implemented as a `FeatureFlag` table cached for 60 s, read through one helper (`features.enabled("ai_explanations", program=…)`).
- Settings are stored in a `PlatformSetting` key/value table with typed validation; environment variables stay for secrets and infrastructure only.

---

## 15. UX principles for the console

- Same admin-kit look as the programme workspace: cards, tables with filters, side drawers for detail, skeletons while loading, inline errors that say what to do.
- Every list: search, filters in the URL (shareable), pagination, empty states that explain, CSV export where useful.
- Dangerous actions: explain the effect in one sentence, require a reason, show who will be notified; destructive ones need typing the name; nothing is irreversible without a waiting period.
- Status words people understand ("Waiting for reply", "Couldn't be delivered"), dates as "2 days ago" with the exact time on hover.
- Keyboard and screen-reader accessible (WCAG 2.1 AA); works on a tablet.
- Optimistic but honest: after an action, the row updates and a toast confirms; on failure, the row returns and the error says why.

---

## 16. Delivery phases

| Phase                              | Scope                                                                                                                         | Why first                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **1 — Enquiries**                  | §5 complete (website forms, API, inbox, notifications, reply, convert to programme); Overview "Needs attention" for enquiries | Website leads are lost today            |
| **2 — Programmes and people**      | §6 lifecycle and detail page; §7 person drawer, invitation tab, bulk actions; §8 in-portal help requests                      | Day-to-day operations of the pilot      |
| **3 — Audit and security**         | §12 audit console and security events/alerts; §1.1 permission sets; §13.1 policy settings                                     | Accountability before more admins join  |
| **4 — System consoles**            | §10 jobs, email log, storage (incl. disk-migration helper), backups view; §11 releases and maintenance mode                   | Fewer trips to the Render dashboard     |
| **5 — Communication and settings** | §9 announcements; §14 settings and feature switches                                                                           | Coordinated rollouts                    |
| **6 — Data protection**            | §13.2 read-only view-as, §13.3 subject requests, §13.5 programme deletion, retention jobs                                     | Needed before scale-up beyond the pilot |

Each phase ships with backend tests (permissions, audit, care-content boundary), Playwright specs for the main flows, and an update to `docs/operations/` runbooks.

---

## 17. Cross-cutting rules (every phase)

- All platform endpoints under `/api/v1/platform/`, guarded by `PlatformView` (role, MFA, password-change gate) and the permission set (§1.1).
- Writes are idempotent (Idempotency-Key) and audited with a reason where access or data is affected.
- Emails go through the outbox and Resend, with delivery tracking.
- Aggregates only across programmes; no care content (§13.4).
- New files go to R2 through `apps.core.storage.private_storage`, served only through authenticated endpoints.

## 18. Open decisions

1. Who receives enquiry notifications, and the response promise shown to enquirers (proposed: 2 working days).
2. Whether the pilot form needs extra fields (e.g. accreditation body, MoU status).
3. Retention periods for enquiries (proposed 24 months), audit trail (proposed 7 years), security events (proposed 2 years).
4. Whether read-only "view as" is acceptable to the programme and ethics owners at all.
5. Whether programme quotas are needed for the pilot or only later.
6. Turnstile (Cloudflare) for spam: off by default, or on from the start?
