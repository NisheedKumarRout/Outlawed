"""One-off: embed every approved post that does not have a vector yet.

Run after seeding, and again after a batch of approvals, to enable vector
Similar Cases. Without it, retrieval falls back to Postgres full-text search,
which still works — this is an upgrade, not a prerequisite.

    python agent-service/scripts/backfill_embeddings.py

Requires OPENAI_API_KEY. The embedding text is built by
services.embeddings.build_embedding_source, the same function the live path
uses, so backfilled and freshly-embedded posts land in the same space.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.clients.embeddings_client import embed_text  # noqa: E402
from app.clients.supabase_client import get_supabase_admin_client  # noqa: E402
from app.config import settings  # noqa: E402
from app.services.embeddings import build_embedding_source  # noqa: E402


async def main() -> int:
    if not settings.embeddings_enabled:
        print(
            "OPENAI_API_KEY is not set, so there is no embedding provider.\n"
            "Similar Cases will keep using the lexical fallback, which works.\n"
            "Set the key and re-run this to enable vector retrieval."
        )
        return 1

    client = get_supabase_admin_client()

    result = (
        client.table("posts")
        .select("id, title, problem, key_takeaway")
        .eq("status", "approved")
        .is_("embedding", "null")
        .execute()
    )
    posts = result.data or []

    if not posts:
        print("Every approved post already has an embedding. Nothing to do.")
        return 0

    print(f"Embedding {len(posts)} post(s) with {settings.embedding_model}…")

    failures = 0
    for post in posts:
        try:
            vector = await embed_text(build_embedding_source(post))
            # Writing embedding on an approved post does not unpublish it: the
            # moderation trigger exempts the service role.
            client.table("posts").update({"embedding": vector}).eq("id", post["id"]).execute()
            print(f"  ok   {post['title'][:70]}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"  FAIL {post['title'][:70]} — {exc}")

    print(f"\nDone. {len(posts) - failures} embedded, {failures} failed.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
