"""Similar Cases: retrieve by meaning, re-rank by context, explain the fit.

Two stages, because retrieval alone is just search:

  1. Retrieve candidates. Vector search when an embedding provider is
     configured, Postgres full-text search when it is not. The fallback is not
     a degraded mode nobody tests — at library scale here it retrieves
     comparably well, and it means the feature never hard-fails on a missing
     third-party key.
  2. Re-rank with the configured AI model against the reader's actual situation and
     have it say *why* each result is relevant. That explanation is the part a
     search box cannot produce, and it is what makes the result usable rather
     than another document to go read.
"""

from __future__ import annotations

import logging

from fastapi.concurrency import run_in_threadpool

from app.clients.ai_client import generate_structured, generate_text
from app.clients.supabase_client import get_supabase_admin_client
from app.schemas.response_schemas import SimilarCase, SimilarCasesRanking

logger = logging.getLogger(__name__)

RERANK_SYSTEM_PROMPT = """\
You help a legal-access organisation decide which past insights actually apply \
to the situation they just described.

You are given their situation and a set of candidate insights retrieved from a \
verified library. For each candidate, score how well it transfers and say why.

What relevance means here:

  * High relevance means the underlying problem and the operating conditions \
    overlap — the same institutional obstacle, the same kind of actor, a \
    comparable setting — so the candidate's conditions and cautions apply.
  * Shared vocabulary is not relevance. Two insights both mentioning "training" \
    are unrelated if one is about volunteer identity and the other about \
    courtroom scheduling.
  * An insight about what *failed* under conditions matching theirs is often \
    more useful than a success under conditions that do not match. Score it \
    that way.

For `why_relevant`, name the specific overlap or the specific mismatch. \
"This is about PLV programmes too" is useless. "Both hinge on whether a single \
district officer stays engaged, which is the dependency you described" is \
useful. Two sentences at most.

Score honestly: if a candidate does not transfer, give it a low score and say \
what does not match. A short accurate list beats a padded one.
"""

BRIEFING_SYSTEM_PROMPT = """\
You write a short briefing for an organisation that described a situation and \
is looking at the most relevant precedents from a verified library.

Write 3-5 sentences of continuous prose. Cover: what the strongest precedents \
have in common with their situation, the single most important condition they \
should check before reusing any of it, and the most consequential caution \
across the set.

Ground every claim in the insights you were given. Do not add outside \
knowledge or general legal advice. If the precedents are weak or only \
partially relevant, say so plainly — that is more useful than manufactured \
confidence.
"""


async def _retrieve_candidates(
    query: str, match_count: int, filter_sector: str | None
) -> tuple[list[dict], str]:
    """Return (rows, retrieval_mode). Over-fetches so the re-rank has choices."""
    client = get_supabase_admin_client()
    fetch_count = min(match_count * 3, 24)

    from app.services.embeddings import embed_query

    # Each retrieval strategy is best-effort. A missing RPC (a database that
    # has not had the search migration applied yet) or a provider outage must
    # degrade to the next strategy, not 500 the whole feature — that is the
    # entire point of having a fallback chain.
    try:
        vector = await embed_query(query)
    except Exception:  # noqa: BLE001
        logger.warning("Embedding the query failed; falling back to lexical.", exc_info=True)
        vector = None

    if vector is not None:

        def _vector_search():
            return client.rpc(
                "match_posts",
                {
                    "query_embedding": vector,
                    "match_count": fetch_count,
                    "filter_sector": filter_sector,
                },
            ).execute()

        try:
            result = await run_in_threadpool(_vector_search)
            rows = getattr(result, "data", None) or []
            if rows:
                return rows, "vector"
        except Exception:  # noqa: BLE001
            logger.warning("match_posts unavailable; falling back to lexical.", exc_info=True)

    def _lexical_search():
        return client.rpc(
            "search_posts_lexical",
            {
                "query_text": query,
                "match_count": fetch_count,
                "filter_sector": filter_sector,
            },
        ).execute()

    try:
        result = await run_in_threadpool(_lexical_search)
        rows = getattr(result, "data", None) or []
        if rows:
            return rows, "lexical"
    except Exception:  # noqa: BLE001
        logger.warning(
            "search_posts_lexical unavailable — has the search migration been run? "
            "Falling back to recent posts.",
            exc_info=True,
        )

    # Nothing matched by meaning or by keyword. Rather than return an empty
    # panel, show the most recent approved insights and let the re-rank stage
    # score them honestly — which will correctly rate them low.
    def _recent():
        query_builder = (
            client.table("posts")
            .select("id, title")
            .eq("status", "approved")
            .order("created_at", desc=True)
            .limit(fetch_count)
        )
        return query_builder.execute()

    result = await run_in_threadpool(_recent)
    rows = [
        {"id": row["id"], "title": row["title"], "similarity": 0.0}
        for row in (getattr(result, "data", None) or [])
    ]
    return rows, "recent"


async def _hydrate(post_ids: list[str]) -> dict[str, dict]:
    if not post_ids:
        return {}

    client = get_supabase_admin_client()

    def _query():
        return (
            client.table("posts")
            .select(
                "id, title, problem, context, approach, key_takeaway, conditions, "
                "cautions, what_worked, what_failed, sector, target_group, geography, "
                "organizations!posts_org_id_fkey(org_name)"
            )
            .in_("id", post_ids)
            .eq("status", "approved")
            .execute()
        )

    result = await run_in_threadpool(_query)
    return {row["id"]: row for row in (getattr(result, "data", None) or [])}


async def _recent_candidate_ids(excluded: set[str], limit: int) -> list[str]:
    """Fill sparse retrieval results with recent approved insights.

    Lexical search can legitimately return only the post currently open. Once
    that post is excluded from "Related cases", the model still needs other
    library records to rank rather than showing a misleading empty state.
    """
    client = get_supabase_admin_client()

    def _query():
        return (
            client.table("posts")
            .select("id")
            .eq("status", "approved")
            .order("created_at", desc=True)
            .limit(min(limit + len(excluded), 48))
            .execute()
        )

    result = await run_in_threadpool(_query)
    return [
        row["id"]
        for row in (getattr(result, "data", None) or [])
        if row["id"] not in excluded
    ][:limit]


def _candidate_digest(post: dict) -> str:
    org = post.get("organizations") or {}
    if isinstance(org, list):
        org = org[0] if org else {}

    lines = [
        f"post_id: {post['id']}",
        f"title: {post.get('title')}",
        f"organisation: {org.get('org_name', 'Unknown')}",
        f"sector: {', '.join(post.get('sector') or []) or 'unspecified'}",
        f"target_group: {', '.join(post.get('target_group') or []) or 'unspecified'}",
        f"geography: {post.get('geography') or 'unspecified'}",
        f"problem: {post.get('problem')}",
        f"context: {post.get('context')}",
        f"key_takeaway: {post.get('key_takeaway')}",
    ]
    for field in ("what_worked", "what_failed", "conditions", "cautions"):
        if post.get(field):
            lines.append(f"{field}: {post[field]}")
    return "\n".join(lines)


async def find_similar_cases(
    query: str,
    match_count: int = 5,
    filter_sector: str | None = None,
    exclude_post_id: str | None = None,
    with_briefing: bool = True,
) -> dict:
    rows, retrieval_mode = await _retrieve_candidates(query, match_count, filter_sector)

    candidate_ids = [row["id"] for row in rows if row["id"] != exclude_post_id]
    target_pool_size = min(match_count * 3, 24)
    if len(candidate_ids) < target_pool_size:
        excluded = set(candidate_ids)
        if exclude_post_id:
            excluded.add(exclude_post_id)
        candidate_ids.extend(
            await _recent_candidate_ids(excluded, target_pool_size - len(candidate_ids))
        )
        if not rows or all(row["id"] == exclude_post_id for row in rows):
            retrieval_mode = "recent"
    posts = await _hydrate(candidate_ids)
    retrieval_scores = {row["id"]: float(row.get("similarity") or 0.0) for row in rows}

    ordered = [posts[pid] for pid in candidate_ids if pid in posts]
    if not ordered:
        return {
            "query": query,
            "retrieval_mode": retrieval_mode,
            "results": [],
            "briefing": None,
        }

    digests = "\n\n---\n\n".join(_candidate_digest(post) for post in ordered)

    ranking = await generate_structured(
        system_prompt=RERANK_SYSTEM_PROMPT,
        user_prompt=(
            f"The organisation's situation:\n\n{query}\n\n"
            f"Candidate insights:\n\n{digests}\n\n"
            "Score every candidate."
        ),
        output_model=SimilarCasesRanking,
        # A ranking is small structured output. Reserving 16k tokens made the
        # request needlessly slow on the interactive post-detail path.
        max_output_tokens=4000,
    )

    by_id = {r.post_id: r for r in ranking.rankings}
    scored: list[SimilarCase] = []

    for post in ordered:
        rank = by_id.get(post["id"])
        if rank is None:
            continue
        org = post.get("organizations") or {}
        if isinstance(org, list):
            org = org[0] if org else {}
        scored.append(
            SimilarCase(
                post_id=post["id"],
                title=post["title"],
                organization_name=org.get("org_name"),
                # The model's contextual relevance is the ranking signal the reader
                # sees; raw retrieval distance is kept only as a tiebreaker.
                similarity=round(rank.relevance / 100, 3),
                why_relevant=rank.why_relevant,
                key_takeaway=post.get("key_takeaway"),
                sector=post.get("sector") or [],
                geography=post.get("geography"),
            )
        )

    scored.sort(key=lambda c: (c.similarity, retrieval_scores.get(c.post_id, 0.0)), reverse=True)
    top = scored[:match_count]

    briefing = None
    if with_briefing and top:
        selected = [posts[c.post_id] for c in top if c.post_id in posts]
        briefing = await generate_text(
            system_prompt=BRIEFING_SYSTEM_PROMPT,
            user_prompt=(
                f"Their situation:\n\n{query}\n\n"
                "Most relevant precedents:\n\n"
                + "\n\n---\n\n".join(_candidate_digest(p) for p in selected)
            ),
            max_output_tokens=2000,
        )

    return {
        "query": query,
        "retrieval_mode": retrieval_mode,
        "results": top,
        "briefing": briefing,
    }
