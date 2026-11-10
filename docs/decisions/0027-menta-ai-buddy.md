# ADR 0027 — Menta, the in-portal AI buddy

**Status:** Accepted for the MVP and presentation  
**Date:** 2026-11-10

## Context

ADR 0026 limited AI to one-click lesson explanations and deferred free-form chat. The product owner now wants a portal-wide buddy, "Menta", usable beyond training. The concept note (§14) allows a _mentor learning assistant_ that answers questions about mentorship processes and platform use from **approved content only**, with no patient-specific advice.

## Decision

Add a bounded assistant, not an open chatbot.

- **Grounding.** The server answers from (a) a short, factual guide for the asker's role and (b) the top matching published lessons and library items the asker is already allowed to read (same programme, published, role-visible). Retrieval is keyword-based; no embeddings or vector store. If nothing matches, Menta says it has no approved material and points to a human.
- **Statelessness.** Conversation history lives only in the browser and is sent with each request (last 6 turns). Nothing is stored server-side; prompts, replies, and keys are never logged.
- **Safety.** The system prompt forbids clinical advice, diagnosis, dosing, and emergency instructions, and treats retrieved text and user text as data. A server guard rejects messages (and earlier user turns) that contain email addresses or 9+ digit runs before any provider call. The UI warns users not to enter patient or personal details. The screen path sent as context has record IDs stripped.
- **Limits.** 600-character messages, 450 output tokens, 40 requests/hour/user, same timeout and failure mapping as ADR 0026.
- **Structure.** New top-layer package `apps/assistant` using only `apps.learning.api`, `apps.content.api`, and the shared `apps.core.ai` client. Frontend: one floating, draggable, keyboard-movable widget mounted once for every role; hidden unless `GET /api/v1/ai/status` reports it live.

## Consequences

- User free text now reaches the AI provider. The identifier guard is a seatbelt, not a guarantee; operator data-processing terms for the provider must be confirmed before real pilot use (see open questions).
- Answers are only as good as published content; thin content yields "no approved material" replies.
- Keyword retrieval is adequate for the pilot corpus; revisit if the library grows large.

## Rollback

Set `AI_ENABLED=false`. The widget disappears and the endpoint returns 503. No schema or stored data to revert.

## Amendment — portal-aware Menta (2026-11-10)

The first version only keyword-matched lesson text, so questions such as "what training do we have?" or "where do I invite a nurse manager?" failed. Menta now grounds every answer in five server-built, user-scoped blocks:

1. **Navigation registry** (`apps/assistant/navigation.py`): every real portal screen per role (id, label, href, purpose, suggested questions). The model may only _name_ an id with a `[[go:id]]` marker; the server resolves it against the asker's role and returns validated `actions`. Unknown, cross-role or URL-shaped markers are dropped. The portal additionally accepts only same-origin relative paths.
2. **Live situation** (`apps/assistant/context.py`): the asker's own status through public module APIs — a student's placement stage, dates, facility/ward and next step; staff placement-state counts, session counts, open-concern counts, a mentor's training progress. No names, emails, phone or registration numbers, notes or concern text.
3. **Curated help guides** (`apps/assistant/knowledge/*.md`): 176 sourced Q&A sections covering every role, account and security, privacy and troubleshooting; the best-matching sections are retrieved per question.
4. **Catalogue**: the training modules and library items the asker can open. Content managers (`manage_content`) see the whole programme catalogue with audience and status, because they govern content they are not the audience for.
5. **Content passages**: matching published lesson/library text (minimum relevance score so incidental words do not surface sources).

`GET /api/v1/assistant/navigation` gives the portal the same registry for instant, AI-free "Jump to" suggestions while typing. The current screen is matched on the raw path, but only an id-free path (keeping `view`/`tab`) is sent to the provider.

Frontend: replies render navigation buttons and a copy action; the empty state shows the current screen, screen-specific suggested questions and quick links; the conversation persists per user in `sessionStorage` for the tab session; Menta opens with Ctrl/⌘+K or the sidebar "Ask Menta" card and closes on an outside press or Escape; idle wandering stays over page content.

Known limits: retrieval is keyword-based; help guides were drafted from code and docs and two errors (admin invite flow, cohort enrolment) were found and fixed in a live check, so the guides need a product-owner review pass before the pilot.
