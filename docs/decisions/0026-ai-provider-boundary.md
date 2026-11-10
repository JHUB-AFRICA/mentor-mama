# ADR 0026 — Server-side AI provider boundary

**Status:** Accepted for the initial learning-explanation slice  
**Date:** 2026-11-09

## Context

The product has deferred AI features. The product owner has now authorized a bounded initial integration using an API key, with a later self-hosted local model. The application is a Django modular monolith and React portal deployed on a managed VPS.

## Decision

Use a server-side provider adapter configured with `AI_ENABLED`, `AI_API_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`. Use the OpenAI API for the MVP and presentation (amended 2026-11-10; Qwen Model Studio was the earlier default). The transport lives in `apps/core/ai.py` and speaks the OpenAI Chat Completions protocol, so a self-hosted OpenAI-compatible server (vLLM, Ollama) replaces it by configuration only. Do not add a provider SDK or database schema for the first feature. Implement a role- and programme-scoped learner endpoint that explains one selected published lesson from its authored text only. The input is an ID, not a free-form prompt; output is ephemeral and clearly labeled.

The provider is disabled by default. Keys are supplied through the VPS environment file and are never exposed to the browser. Bound timeout, input material, output tokens, output size, and request rate. Provider failures return a stable unavailable response without impacting learning operations.

## Consequences

- A self-hosted OpenAI-compatible endpoint can be selected through deployment configuration without changing feature contracts.
- Provider-specific operational setup and region-matched credentials remain deployment responsibilities.
- The initial feature cannot answer arbitrary learner questions; this reduces data exposure and prompt-injection surface.
- Model output needs quality review before expanding into authored content or mentorship workflows.
- The single VPS must not be assumed to have resources for local inference; size and isolate model hosting separately.

## Rollback

Set `AI_ENABLED=false`; no stored AI data or schema migration must be reverted.
