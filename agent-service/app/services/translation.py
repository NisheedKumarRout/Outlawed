"""Faithful Kannada translation with source-versioned caching."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi.concurrency import run_in_threadpool

from app.clients.ai_client import generate_structured
from app.clients.supabase_client import get_supabase_admin_client
from app.config import settings
from app.schemas.response_schemas import KannadaPostTranslation, TranslatePostResponse
from app.services.access import load_visible_post

logger = logging.getLogger(__name__)

LANGUAGE_CODE = "kn"

SYSTEM_PROMPT = """\
Translate the supplied OUTLAWED OTR insight from English into clear, natural \
Kannada suitable for legal-aid practitioners and community paralegal volunteers.

Absolute rules:
1. Translate field by field without summarising, expanding, advising, or adding facts.
2. Preserve all numbers, percentages, dates, evidence qualifications, and uncertainty.
3. Keep established abbreviations such as OTR, PLV, DLSA, KSLSA, POSH and NGO in Latin script.
4. Preserve organisation and programme names unless a standard Kannada rendering is obvious.
5. Use professional, accessible Kannada rather than literary or machine-like phrasing.
6. Optional source fields that are null must remain null.
"""

TRANSLATABLE_FIELDS = (
    "title",
    "problem",
    "context",
    "approach",
    "evidence_outcome",
    "what_worked",
    "what_failed",
    "why_worked_or_failed",
    "conditions",
    "cautions",
    "would_do_differently",
    "key_takeaway",
    "tldr",
)

_memory_cache: dict[tuple[str, str], tuple[str, KannadaPostTranslation]] = {}
_locks: dict[tuple[str, str], asyncio.Lock] = {}


async def _load_persistent_cache(post_id: str, source_updated_at: str):
    client = get_supabase_admin_client()

    def _query():
        return (
            client.table("post_translations")
            .select("content,source_updated_at")
            .eq("post_id", post_id)
            .eq("language_code", LANGUAGE_CODE)
            .maybe_single()
            .execute()
        )

    try:
        result = await run_in_threadpool(_query)
        row = getattr(result, "data", None)
        if row and row.get("source_updated_at") == source_updated_at:
            return KannadaPostTranslation.model_validate(row["content"])
    except Exception:  # The additive migration may not be installed yet.
        logger.info("Persistent translation cache is not available yet.", exc_info=True)
    return None


async def _store_persistent_cache(
    post_id: str,
    source_updated_at: str,
    translation: KannadaPostTranslation,
) -> None:
    client = get_supabase_admin_client()

    def _upsert():
        return (
            client.table("post_translations")
            .upsert(
                {
                    "post_id": post_id,
                    "language_code": LANGUAGE_CODE,
                    "source_updated_at": source_updated_at,
                    "content": translation.model_dump(),
                    "model": settings.active_ai_model,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                on_conflict="post_id,language_code",
            )
            .execute()
        )

    try:
        await run_in_threadpool(_upsert)
    except Exception:  # Memory caching still prevents repeat calls in this process.
        logger.info("Could not persist Kannada translation cache.", exc_info=True)


async def translate_post(
    post_id: str,
    requester_id: str | None,
) -> TranslatePostResponse:
    post = await load_visible_post(post_id, requester_id)
    source_updated_at = post["updated_at"]
    cache_key = (post_id, LANGUAGE_CODE)
    lock = _locks.setdefault(cache_key, asyncio.Lock())

    async with lock:
        memory_entry = _memory_cache.get(cache_key)
        if memory_entry and memory_entry[0] == source_updated_at:
            return TranslatePostResponse(
                post_id=post_id,
                cached=True,
                translation=memory_entry[1],
            )

        persistent = await _load_persistent_cache(post_id, source_updated_at)
        if persistent:
            _memory_cache[cache_key] = (source_updated_at, persistent)
            return TranslatePostResponse(
                post_id=post_id,
                cached=True,
                translation=persistent,
            )

        source = {field: post.get(field) for field in TRANSLATABLE_FIELDS}
        translation = await generate_structured(
            system_prompt=SYSTEM_PROMPT,
            user_prompt="Translate this OTR insight:\n\n"
            + json.dumps(source, ensure_ascii=False),
            output_model=KannadaPostTranslation,
            max_output_tokens=12_000,
        )
        _memory_cache[cache_key] = (source_updated_at, translation)
        await _store_persistent_cache(post_id, source_updated_at, translation)

        return TranslatePostResponse(
            post_id=post_id,
            cached=False,
            translation=translation,
        )
