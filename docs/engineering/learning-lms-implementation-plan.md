# MentorMAMA Learning: training modules and library as a small LMS

Status: **draft for product-owner review** (2026-11-11). Nothing in this plan is built yet. Decisions marked **D-n**
need an answer before the phase that depends on them (see §11).

Sources: Developer Concept Note v1.0 (`docs/product/MentorMAMA_Developer_Concept_Note.pdf`, §§1, 3–10, 12, 14–16, 18–21,
Appendix C), Brand Guidelines, ADR 0017 (content authoring tooling), ADR 0027 (Menta), Stage 3 rules POL-009/010/011 and
WFR-022, and a code audit of `apps.learning`, `apps.content` and the portal content/training features.

---

## 1. Why change it

The concept note asks for "short case-based modules" with "completion tracking and short knowledge checks" (§5.1, §6
Module 3), modules that "support text, PDF, image, video link, and quiz" (§8), a role-based library of "PDFs, quick
guides, short videos, checklists, and facility-specific guidance" (§6 Module 9), and a "completion certificate/report
now" (§19). It also sets the constraints: mobile-first, weak connectivity, "minutes, not hours", and "a practical
workflow product, not just a content repository" (§3, §21).

What exists today meets the letter of the MVP but not its intent:

| Area         | Today                                                             | Problem                                                                                     |
| ------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Lessons      | One text field. The editor shows bold/lists but saves `getText()` | Formatting is silently thrown away; no headings, images, links, video, checklists           |
| Lesson types | `reading / video / checklist` labels                              | Labels only; a "video" lesson cannot hold a video                                           |
| Structure    | Flat list of lessons, one quiz at the end                         | No sections, no per-lesson checks, no prerequisites                                         |
| Questions    | Single choice; correct answer matched by option **text**          | Editing an option breaks scoring history; no feedback, no shuffle, no scenarios             |
| Progress     | Lesson "read" state in `sessionStorage`                           | Lost on another device; not evidence; "mark complete" possible without opening a lesson     |
| Revisions    | Module revise deletes and recreates lessons/questions             | Learners mid-module see content change under them; old attempts lose their question mapping |
| Learners     | Only mentors can complete                                         | Students "view selected" modules (§4, App. C) but get no runner or progress                 |
| Library      | Guides (rich text), documents (download only), external links     | No inline PDF viewer, no video, no tags, no "recently viewed", search over raw JSON         |
| Images       | Base64 inside the guide body                                      | Large rows, slow lists, bloats Menta context                                                |
| Reporting    | Completed/attempted counts                                        | No learner roster, no item analysis, no certificate                                         |
| Gate bug     | `required_modules_complete` ignores `visible_roles`               | A required module meant for students can block mentors                                      |

## 2. Goals and non-goals

Goals

1. Authors build a module from **sections → lessons → blocks** (text, heading, callout, image, video, document, checklist,
   knowledge check), preview it as a learner, save drafts automatically, and publish versions safely.
2. Learners (mentors, and students where the module is for them) resume anywhere, see real progress, answer case-based
   questions with feedback, and receive a branded certificate.
3. Videos from YouTube (and optionally Vimeo) play **inside** MentorMAMA, privacy-enhanced and data-light.
4. Managers see who has completed what, which questions people get wrong, and can export it (branded PDF/XLSX).
5. Every completion stays valid evidence: tied to the exact version learned, never rewritten.

Non-goals (keep it small, §5.2 and "mentor time is sacred"): SCORM/xAPI, discussion forums, gamification/leaderboards
("never to rank, shame, or punish"), live classes, payments, free-text AI grading, AI-generated content without review
(§14), native apps.

## 3. Target experience

### Programme admin (author)

- **Learning studio**: list of modules and library items with status (Draft, In review, Published, Archived), version,
  audience, completion rate, last edited by.
- **Module editor**: outline on the left (sections and lessons, drag to reorder), block editor in the middle, settings on
  the right (audience, required, pass mark, estimated time, certificate on/off, prerequisites).
- **Blocks**: paragraph/heading/list, callout (Info, Tip, Safety), image (uploaded, not base64), **video** (paste a
  YouTube/Vimeo link → title and thumbnail fetched, start time kept), document (pick from library or upload), checklist
  (learner ticks items), knowledge check (inline question with feedback).
- **Question bank** per module: single choice, multiple select, true/false, **scenario** (case stem + per-option
  feedback); explanation per question; lesson link for remediation; CSV import (existing) extended to new types.
- **Autosave** every few seconds with "Saved · 10:42", unsaved-changes guard, draft recovery after a crash.
- **Preview as learner** (mentor or student view) on desktop and phone frame.
- **Publish**: choose _minor_ (typo; existing completions stay complete) or _major_ (content changed; required learners
  must re-complete, with a reason). Version history with diff summary and restore-as-draft.
- **Optional review step** (D-2): "Request review" → a reviewer approves/requests changes before publish.

### Mentor (learner)

- **My learning**: required first, then in progress, then optional; due-by when an assignment has a date (Phase 2);
  "Continue where you left off".
- **Lesson player**: one lesson per screen, large tap targets, progress bar, offline-saved lessons, inline video facade
  (tap to load), checklist ticks saved, inline checks with immediate feedback.
- **Final check**: shuffled questions and options on retake; result screen shows which topics to revisit with links.
- **Certificate**: download a branded PDF (per module, and a programme certificate when all required modules are done).
- Explain-this-lesson (existing AI) stays, grounded in the new block text.

### Student (learner)

- Modules marked for students appear in **Learning** under the library; same player; progress saved; no placement gate.

### Coordinator and nurse manager

- **Training overview** for their scope: required-module completion per mentor (the §9 indicator), overdue/never
  started, last activity; drill into a mentor's record (completions, scores, dates, versions). Export branded PDF/XLSX.

## 4. Domain model (backend)

Keep `apps.learning` as the owner of modules and learner records, and `apps.content` as the library. New and changed
models (all `BaseModel`, programme-scoped):

```
TrainingModule            (existing) + estimated_minutes, certificate_enabled, objectives (list), prerequisites (M2M self)
ModuleVersion             module, number, status(draft|in_review|published|retired), change_kind(minor|major),
                          change_note, published_at, published_by, content_hash
Section                   version, position, title
Lesson                    version, section, position, title, summary, estimated_minutes, blocks (JSON, schema v1)
Question                  version, lesson (nullable = final check), kind(single|multi|true_false|scenario),
                          stem, scenario (text), explanation, position, weight
QuestionOption            question, position, label, is_correct, feedback
LessonProgress            user, lesson, version, status(started|completed), completed_at, checklist_state (JSON)
QuizAttempt               (existing) + version, kind(final|inline), answers keyed by option id, per-question result
ModuleCompletion          (existing) + version, certificate_number, valid_until (nullable; D-4)
Certificate               completion (1:1), number (MM-2026-000123), issued_at, file stored privately
MediaAsset                program, kind(image|document), file (private storage), alt, width/height, created_by
VideoEmbed (value object inside a block): provider(youtube|vimeo), video_id, start_seconds, title, thumbnail_url
LearningAssignment (P2)   module, audience(role|cohort|facility|user), due_on, created_by
```

Rules

- **Versions are immutable once published.** Editing a published module creates a new draft version (copy-on-write).
  Learners who started version N finish version N; new starts get the latest published version (POL-010 preserved).
- **Major change** marks required learners' completions of older versions as "needs refresh" (still counted as historic
  evidence; gate decision D-3). Minor change does nothing to learners.
- **Scoring by option id**, never text. Multi-select is all-or-nothing by default (D-5 allows partial credit).
- **Completion** = every lesson completed (explicit "Mark lesson complete" or finishing its inline check) **and** final
  check passed (if any). Opening a page or playing a video never completes anything (ADR 0017).
- **Gate fix**: `required_modules_complete(user)` and `progress(user)` count only modules whose `visible_roles` include
  the user's role.

Content format

- Lesson `blocks` is a versioned JSON document (Tiptap/ProseMirror JSON constrained to an allow-list schema). Server
  validates: allowed node and mark types, max depth/size, link schemes `https`/`mailto`, images only `MediaAsset` ids,
  video nodes re-parsed by `parse_video_url()`. Unknown nodes are rejected (not stripped silently).
- Plain-text projection is computed on save for search, Menta grounding and AI explanations.
- Existing data migration: every current lesson body becomes one paragraph block; every module becomes version 1
  (published if it was published) with one section "Lessons"; questions and options get ids; attempts are re-keyed
  where the option text still matches, otherwise kept with `legacy=true`. Completions keep their dates and scores.
- Guides move to the same block schema; inline base64 images are extracted to `MediaAsset` during migration.

## 5. Video inside the system

- **Accepted links**: `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`, `/live/`, `m.` and `music.` hosts,
  `youtube-nocookie.com`; `vimeo.com/<id>` and `player.vimeo.com/video/<id>` (with `h=` hash for unlisted). One parser in
  Python and one in TypeScript with shared test vectors. Store only `{provider, video_id, start_seconds}`; never store or
  render an arbitrary URL as an iframe `src`.
- **Metadata**: at authoring time the server calls oEmbed (`https://www.youtube.com/oembed?url=…&format=json`,
  `https://vimeo.com/api/oembed.json?url=…&dnt=1`) with a 3-second timeout, caches title and thumbnail on the block, and
  reports "This video can't be embedded" for private/disabled videos. No API key needed.
- **Player**: an in-house _facade_ component: thumbnail + play button; the iframe is created only when the learner taps
  (saves several hundred KB per lesson on mobile data). Embed `https://www.youtube-nocookie.com/embed/<id>?rel=0&playsinline=1&start=<s>`
  or `https://player.vimeo.com/video/<id>?dnt=1`, `loading="lazy"`, `title=<video title>`, `allow="encrypted-media; picture-in-picture; fullscreen"`,
  `allowfullscreen`, `referrerpolicy="strict-origin-when-cross-origin"` (YouTube requires a referrer; `no-referrer` breaks
  playback). Each video shows a text summary/transcript field and "Open on YouTube" for weak connections.
- **Tracking**: none from the player (no third-party API script). The learner confirms with "Mark lesson complete".
- **Security headers** (added with the feature): CSP `frame-src https://www.youtube-nocookie.com https://player.vimeo.com`,
  thumbnails proxied through the API (no third-party `img-src` needed), Django `SECURE_REFERRER_POLICY =
"strict-origin-when-cross-origin"`.
- Uploaded video files are **out of scope** for the MVP (storage, transcoding, bandwidth). Links only.

## 6. Library upgrades

- One **Learning hub** per role: Learning (modules) and Library (guides, documents, videos, links) as tabs with shared
  search and filters.
- **New item kind: Video** (a library item that is just a video block + summary).
- **Inline PDF viewer** (ADR 0017 already chose `react-pdf`), with Download as a secondary action; DOCX/PPTX stay
  download-only.
- **Tags** (free, admin-managed) and **categories** aligned with the concept-note topics (mentorship, preceptorship,
  feedback, respectful maternity care, documentation, escalation, learner support, onboarding).
- **Search** over the plain-text projection with title boost; pagination; "Recently viewed" and "Saved" per user.
- **Facility-specific guidance** (§6 Module 9): an optional facility scope on library items, shown only to people in that
  facility (D-6).
- Guides render through the same block renderer as lessons; images served from private storage with cache headers.

## 7. API (new or changed, all under `/api/v1/learning/…` unless noted)

| Method    | Path                           | Who                               | Purpose                                                                  |
| --------- | ------------------------------ | --------------------------------- | ------------------------------------------------------------------------ |
| GET       | `modules`                      | learners                          | Published modules for my role, with my progress                          |
| GET       | `modules/<id>`                 | learners                          | Current version for me (pinned if started)                               |
| POST      | `lessons/<id>/progress`        | learner                           | Start / complete a lesson; checklist state                               |
| POST      | `modules/<id>/attempts`        | learner                           | Submit final or inline check (answers by option id)                      |
| GET       | `modules/<id>/certificate`     | learner                           | Branded PDF certificate (documents engine)                               |
| GET/POST  | `studio/modules`               | admin                             | List / create draft                                                      |
| GET/PATCH | `studio/modules/<id>/draft`    | admin                             | Load / autosave the draft version (optimistic `revision` field)          |
| POST      | `studio/modules/<id>/publish`  | admin                             | Publish with `change_kind` and `change_note`                             |
| POST      | `studio/modules/<id>/review`   | admin                             | Request / approve / return (if D-2)                                      |
| GET       | `studio/modules/<id>/versions` | admin                             | History, restore as draft                                                |
| POST      | `studio/media`                 | admin                             | Upload image/document → `MediaAsset`                                     |
| POST      | `studio/video/resolve`         | admin                             | Parse a link + oEmbed → video block value                                |
| GET       | `reports/training`             | admin, coordinator, nurse manager | Completion by mentor within scope; export via the existing export centre |
| GET       | `reports/training/items`       | admin                             | Per-question correctness (item analysis)                                 |

Commands use the existing `IdempotentCommand`, audit entries and outbox events (`ModuleVersionPublished`,
`ModuleCompleted` → notification "Training complete" to the mentor and an optional digest line for nurse managers).

## 8. Frontend

- **Editor**: keep Tiptap (ADR 0017), upgrade to the current 3.x with exact pins, **lazy-load the studio** so learners
  never download it. Custom nodes: Callout, Video (facade preview + link dialog), Checklist, InlineCheck, MediaImage.
  Outline with drag-and-drop (`@dnd-kit`, pinned). Autosave with a debounced PATCH and a visible save state.
- **Renderer**: one React component per block type (no HTML injection). Shared by lessons, guides, previews and Menta
  citations.
- **Player**: route `/learn/<module>/<lesson>`; resume from server progress; offline: the service worker caches the
  current module's lesson JSON and images after first open (videos excluded); progress posts are queued and retried
  (the concept note's offline pattern, §12).
- **Design**: the AdminKit/Sessions-page system; mobile-first player with a bottom "Next" bar; reduced-motion respected.
- **Accessibility**: keyboard navigable outline and questions, focus moved to the lesson title on navigation, video
  `title`, alt text required for images (blocking publish), colour never the only signal for correct/incorrect.

## 9. Delivery plan

**Phase 0 — fix what is wrong today (small, 1–2 days)**

- Lesson editor keeps formatting (store Tiptap JSON, render it) or removes the misleading toolbar.
- Gate and progress respect `visible_roles`.
- Module duplicate keeps the cover; module covers move to private storage like library covers.
- Score by option id going forward (prepare for the migration).
- Library rows show real `completed` / `required` for the viewer.

**Phase 1 — LMS MVP (about 3–4 weeks of focused work)**

1. Models, migration of existing modules into version 1, block schema validator, plain-text projection.
2. Studio: outline + block editor (text, heading, callout, image, video, document, checklist), autosave, preview,
   publish with minor/major, version history.
3. Question bank: single, multi, true/false, scenario; explanations and per-option feedback; inline and final checks;
   shuffle on retake; CSV import for all types.
4. Player for mentors and students; server progress; resume; offline lesson cache.
5. YouTube/Vimeo facade, link resolver, CSP/referrer headers.
6. Certificates (branded PDF through `apps/core/documents`, verification number).
7. Training reports for admin/coordinator/nurse manager + export (PDF/XLSX).
8. Library: video items, inline PDF viewer, tags, search over projections, pagination.

**Phase 2 — after pilot feedback**

- Assignments with due dates (cohort, facility, person) and reminders; "needs refresh" after major changes.
- Review workflow (if D-2), recertification (`valid_until`, D-4), spaced refreshers (3–5 questions at 2–4 weeks).
- Kiswahili content variants (§19), with human review.
- AI: scenario drafting for authors (§14, must be reviewed), module Q&A grounded in the module only.

## 9a. Implementation status (2026-11-11)

Done: Phase 0 in full (lesson formatting now saved and rendered; role/archive-aware gate and progress; duplicate keeps
cover; covers served privately through `/training/modules/<id>/cover`; scoring by stable option id with legacy-text
fallback and in-place question updates; library rows show the viewer's completion). From Phase 1: server-side lesson
progress (`LessonProgress`, resumes on any device; read-only completion now requires every lesson opened); students
can complete modules assigned to their role; YouTube/Vimeo video lessons with a tap-to-load privacy player.

Versions (done, simplified from §4): publishing snapshots the editable working copy into an immutable `ModuleVersion`
(number, minor/major, note, hash); republishing unchanged content makes no new version; edits to a live module stay
unpublished until published; learners finish the version they started (pinned by their lesson progress) and completions
record the version; a completion of an older version still satisfies the placement gate for 30 days after a major change
(D-3) then shows "needs refresh"; admins get version history with restore-as-draft. Lessons and questions keep stable
ids across edits. Existing published modules were migrated to version 1 (`learning.0008`). Deviation from §4: versions
are JSON snapshots, not separate Section/Lesson/Question tables.

Authoring blocks (done, simplified): lesson bodies are validated against an allow-list (`apps/learning/blocks.py`:
known nodes and marks, https/mailto links, images only from uploaded media with alt text, size/depth limits); callout
boxes (info, tip, safety), headings, lists, links and uploaded images (private `MediaAsset`, 2MB, verified with Pillow,
served to signed-in programme members only); optional lesson section names grouped in the player outline; labelled
toolbar. Not built from §4: checklist block, document block, base64 image extraction for guides.

Question types (done): single choice, multiple select (all-or-nothing, D-5), true/false, optional case description,
explanation, per-answer feedback, scoring by option id, per-question feedback after each attempt (right answers are shown
only once the module is passed), shuffled questions and answers on retries, CSV template and import for all types.
Not built: inline per-lesson checks, a shared question bank across modules, remediation links to lessons.

Authors' learners stuck on an old version: a learner moves to the latest version once a newer major version is past the
30-day grace period.

Learning for every audience (done): modules are not mentor-only. A Learning page with the same player exists for
students (`/student?view=learning`), coordinators (`/coordinator/learning`) and nurse managers (`/facility/learning`),
alongside the mentors' Training page; library module pages link to the right place per role; role-specific wording; the
placement gate still applies to mentors only.

Certificates (done): one certificate per user, module and version, issued automatically on completion (legacy
completions get theirs on first download), number `MM-YYYY-NNNNNN`, branded landscape PDF ("Certificate of completion",
no CPD wording, D-7), per-module on/off switch, admin verification endpoint `GET /training/certificates/<number>`.

Training reports (done): `GET /reports/training` (admin: all active mentors; coordinator/nurse manager: mentors on
placements in their scope) with per-mentor required-module status (complete, in progress, not started, needs refresh),
per-module counts and average score, and the hardest questions; shown in the Reports > Training tab with CSV export of
each table. Not built: PDF/XLSX export of this report through the Export Center, training for staff audiences in the
report (it covers modules for mentors), and a learner-level drill-down.

Not started (Phase 1 remainder): checklist and document blocks, inline checks, question bank and
question types, certificates, training reports, offline player, library video/PDF viewer/tags/facility scope,
autosave and preview-as-learner. Legacy module covers uploaded before this change stay in the storage they were
saved in; they are now only served through the authenticated endpoint, but the files are not moved.

## 10. Testing and acceptance

- Backend: schema validator (allowed/blocked nodes, link schemes, size), video URL parser vectors (Python and TS
  share a JSON fixture), version pinning, minor vs major publish effects, scoring by option id for every question type,
  completion rules (cannot complete without lessons), gate respects roles, certificate content, report scoping per role,
  migration of existing data (dry-run on a copy of the dev DB).
- Frontend: Playwright journeys for author (create → add video → preview → publish), mentor (start on desktop, resume on
  a 390px phone, pass check, download certificate), student (optional module), offline lesson reopen.
- Acceptance (from §15/§16): "A mentor can complete a training module, pass a short quiz, and see completion status";
  "system records completion, score, date, and module status" — plus version and certificate number.

## 11. Decisions

**Status 2026-11-11: product owner delegated and asked for the recommendations to be applied. All eight are adopted
as working decisions (reversible before the pilot; revisit D-1 and D-7 once clinical content and wording are
reviewed by the programme).**

| #   | Question                                                                               | Recommendation (adopted)                                     |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| D-1 | Which two modules have final content for the pilot (§18)?                              | Role of a Clinical Mentor; Escalation and Safeguarding       |
| D-2 | Add a review step before publishing?                                                   | Optional "Request review" in Phase 2; admin-only publish now |
| D-3 | After a **major** change, does an older completion still satisfy the placement gate?   | Yes for 30 days, then refresh required                       |
| D-4 | Do completions expire (recertification)?                                               | Not in the pilot                                             |
| D-5 | Partial credit for multiple-select?                                                    | No (all-or-nothing)                                          |
| D-6 | Facility-specific library items in Phase 1?                                            | Yes, simple facility scope                                   |
| D-7 | Certificate wording and whether it may mention CPD (§19: no regulator integration yet) | "Certificate of completion", no CPD points                   |
| D-8 | Vimeo in Phase 1 or YouTube only?                                                      | YouTube only first; the model already supports Vimeo         |

## 12. Risks

- **Data migration** of live completions: dry-run, keep legacy rows, never delete attempts (POL-011).
- **Bandwidth**: video facade, image size limits and server-side resizing, offline cache size cap.
- **Scope creep** into a generic LMS: every feature must pass "does this save a mentor time or help a student?" (Brand
  values, §3).
- **Third-party video availability** in facilities: always show the text summary; never make a video the only route to
  completion.
