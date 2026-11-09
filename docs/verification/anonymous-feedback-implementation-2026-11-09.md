# Anonymous feedback and reporting implementation — 9 November 2026

## Implemented in source

- Dedicated `POST /api/v1/feedback/anonymous` accepts a transient placement ID in the JSON body; the URL contains no placement identifier and the response returns no record ID.
- Anonymous feedback is a fixed three-question 1–5 rating instrument. The anonymous serializer rejects comments and arbitrary question codes.
- The feedback row stores only its UUID, cohort, facility, ward, and local submission date. Anonymous scores use a separate table without exact timestamps; timestamps on confidential and assessment response rows are preserved.
- Replay protection stores a keyed command digest, keyed payload digest, and date only. Anonymous submissions do not create generic actor-linked idempotency rows, actor audit entries, or feedback outbox events.
- A global daily count is retained for operations without respondent or scope references.
- Coordinator and Nurse Manager reports use a materialized aggregate. A group and each question appear only after at least three submissions. The API enforces institution and facility scope respectively; comments and respondent identifiers are absent.
- Migration `assessments.0004_anonymous_feedback_privacy` scrubs legacy feedback audit/idempotency links, related outbox/notification rows, anonymous comments, and anonymous-only exact timestamps while preserving coarse daily counts. It moves anonymous score rows out of the shared response table. Analytics migration `0009` builds the aggregate view.
- Migration `assessments.0004` intentionally discards legacy anonymous comments and correlating metadata; rollback cannot restore those values. It preserves timestamps on non-anonymous response rows.

## Verification

- Django `check`: passed.
- `makemigrations --check --dry-run`: passed with no model drift; Django warned that it could not verify migration history because PostgreSQL is unreachable.
- Python compilation and `git diff --check`: passed.
- Portal TypeScript check: passed.
- Scoped portal ESLint: passed.
- Focused PostgreSQL API tests were attempted but could not initialize the test database because the configured PostgreSQL server refused the connection. No migrations were applied and no live API/database acceptance is claimed.
- Browser acceptance remains pending because there is no available browser target.

## Acceptance still required

Apply migrations on the verification database, run the focused and full backend suite, test the migration against legacy anonymous rows (including audit trigger behavior), verify cohort/facility isolation and the minimum-three suppression in the live API, then complete Student and staff report browser journeys.
