# AI integration plan

**Status:** Initial learning slice implemented on OpenAI; activation requires an API key and a smoke test.  
**Date:** 2026-11-09

## Direction

AI is a server-side capability of the Django modular monolith. Feature code uses a small provider boundary configured by environment variables. The MVP provider is the OpenAI API (Chat Completions). Transport, limits, and failure handling live in `apps/core/ai.py`; features such as `apps/learning/ai.py` own only their prompt and data scoping. A later self-hosted OpenAI-compatible server (vLLM, Ollama) replaces OpenAI by changing the base URL, model, and credential; product/API contracts remain unchanged.

The first product slice is a learner-requested, plain-language explanation of one published lesson. The server resolves the lesson from the user's existing programme and role-scoped training modules and sends only that lesson's authored title and text. It does not send user prompts, quiz answers, placements, mentorship records, safeguarding records, or personal data. The response is ephemeral, labeled AI-generated, and not stored.

## Provider and secret setup

Set these values only in the VPS `.env.production` file (mode `0600`), then recreate the API service:

```dotenv
AI_ENABLED=true
AI_API_KEY=<OpenAI project key>
AI_API_BASE_URL=https://api.openai.com/v1   # default
AI_MODEL=gpt-4o-mini                         # default
AI_TEMPERATURE=0.2                           # leave empty for gpt-5*/o-series reasoning models
AI_TIMEOUT_SECONDS=20
AI_MAX_OUTPUT_TOKENS=500
```

Use a dedicated OpenAI project key with a monthly spend limit. Verify it with `python manage.py ai_smoke_test`. Keep the key out of source control, portal variables, images, logs, analytics, and support tickets. The capability stays off by default and returns a stable unavailable response until enabled with a key.

For a future private self-hosted endpoint, change `AI_API_BASE_URL`, `AI_MODEL`, and (if configured) `AI_API_KEY`. Keep that endpoint on a private network and allow outbound AI traffic only from the backend. Model-server authentication alone is not a substitute for network isolation.

## Menta (portal-wide buddy)

See ADR 0027. `POST /api/v1/assistant/chat` answers questions grounded in the asker's screens (navigation registry), own live status, curated help guides, catalogue and readable content, and may return server-validated navigation actions; `GET /api/v1/assistant/navigation` lists the asker's screens. History is client-held (tab session) and never stored server-side. `manage.py ai_smoke_test` verifies the provider before a demo.

## Guardrails and operations

- Scope every request using the existing authenticated `visible_modules` query; resolve the requested lesson under that module.
- Accept only a lesson identifier. Do not accept free-text user prompts in this first slice.
- Send only the selected lesson, cap material length, response tokens, response size, and network timeout.
- Keep the call synchronous and read-only; a provider outage does not affect training content, completion, or quiz submission.
- Never log prompts, lesson bodies, provider responses, API keys, or request headers. Do not persist prompts/responses or add them to error tracking.
- Apply per-user rate limiting before production enablement; monitor aggregate success/error outcomes and latency from content-free provider log events. The implementation uses a conservative endpoint throttle and does not log user IDs, lesson text, or model output.
- Treat provider output as untrusted plain text. It is not clinical guidance and must remain grounded in the selected lesson.
- Keep AI disabled in local/CI by default. Do not use production credentials in CI or sandbox verification.

## Rollout

1. Deploy with `AI_ENABLED=false` and verify normal learning routes.
2. Install the region-matched key in the VPS secret file; enable the feature and restart only the API.
3. Verify a permitted learner can request an explanation, a cross-programme/unpublished lesson is non-disclosing, and provider timeout/failure shows a recoverable message.
4. Review usage, latency, model quality, data handling terms, and cost before expanding to free-text questions or mentorship workflows.
5. Before any self-hosted rollout, size the VPS separately for model memory/compute; the existing application VPS is not assumed to have suitable accelerator capacity.

## Deferred capabilities

Open-ended chat beyond approved content, AI-generated or edited learning content, retrieval across the whole library, mentorship-note assistance, patient-specific or clinical guidance, automated decisions, conversation history, embeddings/vector databases, and local model hosting remain out of scope. Each needs a separate product, privacy, evaluation, and operations decision.

## Rollback

Set `AI_ENABLED=false` and recreate the API. The feature returns an unavailable message while all non-AI learning routes continue to work. No schema or persistent AI data needs rollback.

## Provider references

- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat)
- [vLLM OpenAI-compatible server](https://docs.vllm.ai/en/stable/serving/online_serving/openai_compatible_server/)
- [vLLM security guidance](https://docs.vllm.ai/en/stable/usage/security/)
