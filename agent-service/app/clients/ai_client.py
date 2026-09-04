"""Provider-neutral text and structured-output generation.

Gemini is the default for the hackathon deployment. Anthropic remains an
optional provider so changing providers later is an environment change rather
than another rewrite of every service.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache
from typing import TypeVar

from pydantic import BaseModel

from app.config import settings

OutputModel = TypeVar("OutputModel", bound=BaseModel)


def _require_provider() -> str:
    provider = settings.ai_provider
    if provider not in {"gemini", "anthropic"}:
        raise RuntimeError("AI_PROVIDER must be either 'gemini' or 'anthropic'.")
    if provider == "gemini" and not settings.gemini_api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured. Set it in the repository-root "
            ".env (or agent-service/.env) before calling an AI route."
        )
    if provider == "anthropic" and not settings.anthropic_api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not configured. Set it in the repository-root "
            ".env (or agent-service/.env) before calling an AI route."
        )
    return provider


@lru_cache(maxsize=1)
def _gemini_client():
    from google import genai

    return genai.Client(api_key=settings.gemini_api_key)


def _gemini_models() -> tuple[str, ...]:
    return tuple(
        dict.fromkeys(
            model
            for model in (settings.gemini_model, settings.gemini_fallback_model)
            if model
        )
    )


def _retryable_gemini_error(exc: Exception) -> bool:
    from google.genai.errors import APIError

    return isinstance(exc, APIError) and getattr(exc, "code", None) in {429, 500, 502, 503, 504}


def _gemini_config(**kwargs):
    from google.genai import types

    return types.GenerateContentConfig(
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        **kwargs,
    )


async def generate_structured(
    *,
    system_prompt: str,
    user_prompt: str,
    output_model: type[OutputModel],
    max_output_tokens: int,
) -> OutputModel:
    """Generate and validate one schema-constrained response."""
    provider = _require_provider()

    if provider == "gemini":
        response = None
        last_error: Exception | None = None
        for model in _gemini_models():
            try:
                response = await _gemini_client().aio.models.generate_content(
                    model=model,
                    contents=user_prompt,
                    config=_gemini_config(
                        system_instruction=system_prompt,
                        max_output_tokens=max_output_tokens,
                        temperature=0.1,
                        response_mime_type="application/json",
                        response_schema=output_model,
                    ),
                )
                break
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if not _retryable_gemini_error(exc):
                    raise
        if response is None:
            assert last_error is not None
            raise last_error
        parsed = response.parsed
        if isinstance(parsed, output_model):
            return parsed
        if parsed is not None:
            return output_model.model_validate(parsed)
        if response.text:
            return output_model.model_validate_json(response.text)
        raise RuntimeError("Gemini returned no structured output.")

    from app.clients.claude_client import get_async_claude_client

    response = await get_async_claude_client().messages.parse(
        model=settings.claude_model,
        max_tokens=max_output_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
        output_format=output_model,
    )
    if response.parsed_output is None:
        raise RuntimeError("Anthropic returned no structured output.")
    return response.parsed_output


async def generate_text(
    *,
    system_prompt: str,
    user_prompt: str,
    max_output_tokens: int,
) -> str:
    provider = _require_provider()

    if provider == "gemini":
        response = None
        last_error: Exception | None = None
        for model in _gemini_models():
            try:
                response = await _gemini_client().aio.models.generate_content(
                    model=model,
                    contents=user_prompt,
                    config=_gemini_config(
                        system_instruction=system_prompt,
                        max_output_tokens=max_output_tokens,
                        temperature=0.2,
                    ),
                )
                break
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if not _retryable_gemini_error(exc):
                    raise
        if response is None:
            assert last_error is not None
            raise last_error
        text = response.text
        if not text:
            raise RuntimeError("Gemini returned no text output.")
        return text.strip()

    from app.clients.claude_client import get_async_claude_client

    response = await get_async_claude_client().messages.create(
        model=settings.claude_model,
        max_tokens=max_output_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    return "".join(
        block.text for block in response.content if block.type == "text"
    ).strip()


async def stream_text(
    *,
    system_prompt: str,
    user_prompt: str,
    max_output_tokens: int,
) -> AsyncIterator[str]:
    provider = _require_provider()

    if provider == "gemini":
        last_error: Exception | None = None
        for model in _gemini_models():
            emitted = False
            try:
                stream = await _gemini_client().aio.models.generate_content_stream(
                    model=model,
                    contents=user_prompt,
                    config=_gemini_config(
                        system_instruction=system_prompt,
                        max_output_tokens=max_output_tokens,
                        temperature=0.2,
                    ),
                )
                async for chunk in stream:
                    if chunk.text:
                        emitted = True
                        yield chunk.text
                return
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if emitted or not _retryable_gemini_error(exc):
                    raise
        assert last_error is not None
        raise last_error
        return

    from app.clients.claude_client import get_async_claude_client

    client = get_async_claude_client()
    async with client.messages.stream(
        model=settings.claude_model,
        max_tokens=max_output_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    ) as stream:
        async for text in stream.text_stream:
            yield text
