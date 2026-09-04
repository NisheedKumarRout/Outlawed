"""Embedding helpers for posts and queries.

The text an insight is embedded from must be built the same way here and in
supabase/seed.py, or a seeded post and a freshly submitted one end up in
different regions of the vector space for no reason the data justifies.
"""

from __future__ import annotations

from fastapi.concurrency import run_in_threadpool

from app.clients.embeddings_client import embed_text
from app.clients.supabase_client import get_supabase_admin_client
from app.config import settings


def build_embedding_source(post: dict) -> str:
    """The canonical text an insight is embedded from.

    Mirrors supabase/seed.py: title, problem, key takeaway. Keep the two in
    step — see the note at the top of that file.
    """
    return f"{post.get('title', '')}. {post.get('problem', '')} {post.get('key_takeaway', '')}".strip()


async def embed_query(query: str) -> list[float] | None:
    """Embed a search query, or None when no provider is configured."""
    if not settings.embeddings_enabled:
        return None
    return await embed_text(query)


async def embed_post(post_id: str) -> bool:
    """Compute and store one post's embedding. Returns False when disabled.

    Writing `embedding` on an approved post does not unpublish it: the
    moderation trigger exempts the service role. See the note on
    reset_status_on_org_edit in supabase/schema.sql.
    """
    if not settings.embeddings_enabled:
        return False

    client = get_supabase_admin_client()

    def _fetch():
        return (
            client.table("posts")
            .select("id, title, problem, key_takeaway")
            .eq("id", post_id)
            .maybe_single()
            .execute()
        )

    result = await run_in_threadpool(_fetch)
    post = getattr(result, "data", None)
    if not post:
        return False

    vector = await embed_text(build_embedding_source(post))

    def _update():
        return client.table("posts").update({"embedding": vector}).eq("id", post_id).execute()

    await run_in_threadpool(_update)
    return True
