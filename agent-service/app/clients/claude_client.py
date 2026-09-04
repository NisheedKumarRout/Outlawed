from functools import lru_cache

from anthropic import Anthropic, AsyncAnthropic

from app.config import settings


def _require_key() -> str:
    if not settings.anthropic_api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not configured. Set it in the repository-root "
            ".env (or agent-service/.env) before calling any AI route."
        )
    return settings.anthropic_api_key


@lru_cache(maxsize=1)
def get_claude_client() -> Anthropic:
    """Synchronous client. Used by the one-off backfill scripts."""
    return Anthropic(api_key=_require_key(), timeout=settings.request_timeout_seconds)


@lru_cache(maxsize=1)
def get_async_claude_client() -> AsyncAnthropic:
    """Async client. Every FastAPI route uses this one.

    The routes are `async def`, so a synchronous client here would block the
    event loop for the whole duration of a Claude call — which for redaction
    of a long transcript is tens of seconds.
    """
    return AsyncAnthropic(api_key=_require_key(), timeout=settings.request_timeout_seconds)
