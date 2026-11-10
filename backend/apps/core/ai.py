"""Server-side AI provider boundary shared by every AI feature.

Feature code (for example ``apps.learning.ai``) owns prompts and data scoping;
this module owns transport, limits, and failure behaviour. It speaks the
OpenAI Chat Completions protocol, so the MVP uses OpenAI directly and a later
self-hosted OpenAI-compatible server (vLLM, Ollama) only needs different
``AI_API_BASE_URL`` / ``AI_MODEL`` / ``AI_API_KEY`` values.

Privacy rules enforced here: prompts, completions, and credentials are never
logged; only content-free outcome and latency events are emitted.
"""

import json
import logging
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from django.conf import settings

logger = logging.getLogger(__name__)

MAX_PROMPT_CHARS = 24_000
MAX_COMPLETION_CHARS = 4_000
MAX_RESPONSE_BYTES = 128_000


class AIProviderError(Exception):
    """Provider is disabled, unavailable, or returned an unusable response."""


def is_configured() -> bool:
    """True when AI is switched on and a credential is present."""
    return bool(settings.AI_ENABLED and settings.AI_API_KEY)


def chat_completion(
    *,
    feature: str,
    system: str,
    user: str,
    history: list[dict[str, str]] | None = None,
    max_output_tokens: int | None = None,
) -> str:
    """Run one bounded, stateless chat completion and return plain text.

    ``feature`` is a short static label used only for content-free logging.
    ``history`` is optional prior ``user``/``assistant`` turns supplied by the caller;
    nothing is stored here.
    Raises :class:`AIProviderError` for every failure mode so callers can map a
    single stable "unavailable" response.
    """
    if not is_configured():
        raise AIProviderError("AI is not configured")
    started_at = time.monotonic()

    def elapsed_ms() -> int:
        return int((time.monotonic() - started_at) * 1000)

    payload = {
        "model": settings.AI_MODEL,
        "max_completion_tokens": max_output_tokens or settings.AI_MAX_OUTPUT_TOKENS,
        "messages": [
            {"role": "system", "content": system},
            *[
                {"role": turn["role"], "content": turn["content"][:MAX_PROMPT_CHARS]}
                for turn in (history or [])
                if turn.get("role") in ("user", "assistant")
            ],
            {"role": "user", "content": user[:MAX_PROMPT_CHARS]},
        ],
    }
    # Reasoning models reject a custom temperature; an empty setting omits it.
    if settings.AI_TEMPERATURE is not None:
        payload["temperature"] = settings.AI_TEMPERATURE

    endpoint = urljoin(settings.AI_API_BASE_URL.rstrip("/") + "/", "chat/completions")
    request = Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.AI_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=settings.AI_TIMEOUT_SECONDS) as response:  # noqa: S310 - https base URL from trusted settings
            result = json.loads(response.read(MAX_RESPONSE_BYTES))
        text = result["choices"][0]["message"]["content"]
    except HTTPError as exc:
        # Status code only: the body can echo prompt content.
        logger.warning("ai_provider feature=%s outcome=http_%d latency_ms=%d", feature, exc.code, elapsed_ms())
        raise AIProviderError from exc
    except (URLError, TimeoutError, OSError, ValueError, KeyError, IndexError, TypeError) as exc:
        logger.warning("ai_provider feature=%s outcome=error latency_ms=%d", feature, elapsed_ms())
        raise AIProviderError from exc
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_COMPLETION_CHARS:
        logger.warning("ai_provider feature=%s outcome=invalid_response latency_ms=%d", feature, elapsed_ms())
        raise AIProviderError
    logger.info("ai_provider feature=%s outcome=success latency_ms=%d", feature, elapsed_ms())
    return text.strip()
