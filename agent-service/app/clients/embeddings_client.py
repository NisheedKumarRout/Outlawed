"""Embedding provider.

Deliberately optional. Anthropic does not ship a first-party embeddings API,
so vector search here depends on a third-party key. Rather than make Similar
Cases hard-fail without one, `embeddings_enabled` is checked by callers and
services/similarity.py falls back to Postgres full-text search.

The model and dimension must stay in lockstep with supabase/seed.py and the
`vector(1536)` column in supabase/schema.sql. Embedding a query with a
different model than the stored vectors produces silently wrong similarity
scores rather than an error, which is the worst possible failure mode.
"""

from __future__ import annotations

from functools import lru_cache

from app.config import settings


@lru_cache(maxsize=1)
def get_embeddings_client():
    if not settings.openai_api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not configured; embeddings are unavailable. "
            "Callers should check settings.embeddings_enabled first."
        )

    from openai import AsyncOpenAI

    return AsyncOpenAI(api_key=settings.openai_api_key)


async def embed_text(text: str) -> list[float]:
    client = get_embeddings_client()
    response = await client.embeddings.create(
        model=settings.embedding_model,
        input=text.replace("\n", " ")[:8_000],
    )
    return response.data[0].embedding
