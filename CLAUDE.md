# MentorMAMA — working agreement

A digital mentorship toolkit for safer midwifery clinical placement. Monorepo: `apps/web` (marketing PWA),
`apps/portal` (product PWA), `backend` (Django), `packages/*` (shared config and UI).

**Read `docs/onboarding/ENGINEERING_RULES.md` before writing backend or frontend code.** It is the full rule
set; this file is the short version plus the things easy to get wrong here.

## Design authority

The architecture is decided in `docs/architecture/`, Stages 1–6. When code and a design document disagree, the
document wins. When two documents disagree, the later stage wins — the order is in
`docs/architecture/document-reconciliation-record.md`. Architecture decisions live in
`docs/architecture/decisions/` (ADR 0001–0012); read the relevant one before changing a mechanism it describes.

Rule identifiers used throughout the code and this repo: `INV-xx` invariants, `POL-xx` policies, `WFR-xx`
workflow rules, `AUTH-xx` authorization, `MA-xx` module architecture, `TX-xx` transactions.

## Backend non-negotiables

- **All business logic in `services.py`.** Views parse and delegate; serializers shape and validate fields;
  models hold structure and single-row constraints. No logic in `save()`, and **no Django signals for domain
  logic** — the event mechanism is the transactional outbox.
- **Module internals are private.** Import only `apps.<module>.api`, `.events`, and `.ports` across modules.
  Never another module's `models`, `services`, `state_machine`, `selectors`, `views` or `blockers`.
  `import-linter` enforces this in CI (`.importlinter`, 12 contracts).
- **Dependencies point downward only** (`core`/`identity` → `institutions`/`facilities`/`learning`/`content` →
  `placements` → placement-bound children → `analytics`/`notifications`). No upward imports, no sideways
  imports between siblings. If a lower module needs a higher one's answer, define a port in the lower module and
  let the higher one register an implementation in `AppConfig.ready()`.
- **Cross-module foreign keys must point downward** (to a lower layer), always by string reference
  (`ForeignKey("placements.Placement", ...)`), always `on_delete=PROTECT`. Upward or sideways relations use a
  bare `UUIDField` validated through the owning module's `api.py`; leaf modules (`analytics`, `notifications`)
  hold bare identifiers only. Rationale and the stress test: ADR 0013.
- **Never swallow an `IntegrityError`.** Translate it to a domain error from `core.errors`. The database enforces
  12 of 18 invariants; a caught-and-ignored constraint is worse than no constraint.
- **Every write**: inside `transaction.atomic()`, with `select_for_update()` on the aggregate and guards
  re-checked under the lock, an audit entry, and an outbox event. **No external I/O inside a transaction.**
- **No `bulk_create` / `bulk_update` / `.update()` on operational tables** — they skip validation, audit and
  events. No `delete()` on operational data; set `archived_at`.
- **PostgreSQL everywhere, including local dev and tests.** SQLite cannot express our partial indexes,
  `EXCLUDE` constraints or triggers, so a green SQLite run proves nothing (ADR 0009).

## Frontend non-negotiables

- Features never import each other; shared code lives in `lib/`.
- Every mutating request goes through `lib/offline`, which assigns the `Idempotency-Key` at form-open time and
  owns the retry queue. No feature calls `fetch` for a write.
- Gate UI on capability flags from `GET /me` and on `GET /placements/{id}/transitions` — never on role strings
  or a client-side copy of the state machine.
- Every screen defines empty, loading, error, **offline-queued**, and success states.
- The logo comes from the `Logo` component; never re-set the logotype in a font. See
  `assets/brand/logo/README.md`.
- Brand palette: navy `#0D1B33` ~30%, white/mist ~50%, teal `#1D8C8C` ~15%, terracotta `#D97757` **under 5% and
  never decorative**. Headings Manrope, body Inter.

## Safeguarding and privacy — treat as hard constraints

- **No patient-identifiable field, ever.** A migration introducing one fails CI.
- Escalation `description`/`action_taken` are readable only by the assigned reviewer, the submitter, and a
  Program Administrator. Never in a list response, event payload, export, or log line.
- Mentor-visible feedback aggregates are suppressed below 3 responses, per displayed figure, with no attribute
  breakdowns.
- Anonymous feedback has no placement or student reference. Do not add one.

## Commands

```bash
# database (port 5433 — the host's own Postgres usually holds 5432)
POSTGRES_PORT=5433 docker compose -f docker-compose.dev.yml up -d

# backend
cd backend && python manage.py migrate && python manage.py runserver
cd backend && pytest                        # runs against Postgres
cd backend && lint-imports                  # module boundary contracts

# frontend
pnpm --filter @mentormama/web dev
pnpm --filter @mentormama/web lint
pnpm --filter @mentormama/web build
```

## Repo conventions

- Names come from the Ubiquitous Language (Stage 2 §2.1): Placement, Mentorship Session, Induction Checklist,
  Escalation, Cohort. Not Attachment, Meeting, Orientation Form, or Complaint.
- Branded stage documents are generated from their Markdown source by
  `docs/architecture/tools/build-branded-doc.mjs`. Edit the Markdown, never the PDF or DOCX.
- Design docs are the source of truth for behaviour; don't restate rules in code comments — reference the id.
