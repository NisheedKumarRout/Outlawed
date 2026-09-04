"""Independent visibility enforcement for the service-role client.

Every other layer in this system is protected by Row Level Security. This
service is not: it holds the service-role key, so Postgres will hand it any
row it asks for. That makes it the one place where authorization has to be
written out by hand.

The rule this module exists to enforce: never assume the caller upstream
already checked. The Next.js proxy does check the session and role before
forwarding, and this module checks again anyway. That is deliberate
duplication, not redundancy — a service that can see everything has to
enforce visibility itself, or the check only ever existed in one hop that a
future refactor can quietly remove.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool

from app.clients.supabase_client import get_supabase_admin_client

POST_COLUMNS = (
    "id, org_id, title, problem, context, approach, evidence_outcome, "
    "what_worked, what_failed, why_worked_or_failed, conditions, cautions, "
    "would_do_differently, key_takeaway, sector, target_group, geography, "
    "tags, tldr, status, visibility, created_at, updated_at"
)


def _not_found() -> HTTPException:
    """Hidden and nonexistent posts are intentionally indistinguishable.

    Returning 403 for a post that exists but is unpublished would confirm its
    existence to anyone probing ids.
    """
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="That insight is not available.",
    )


async def _fetch_profile_role(requester_id: str) -> str | None:
    client = get_supabase_admin_client()

    def _query():
        return (
            client.table("profiles")
            .select("role")
            .eq("id", requester_id)
            .maybe_single()
            .execute()
        )

    result = await run_in_threadpool(_query)
    data = getattr(result, "data", None)
    return data.get("role") if data else None


async def _is_verified_org(requester_id: str) -> bool:
    client = get_supabase_admin_client()

    def _query():
        return (
            client.table("organizations")
            .select("verified")
            .eq("id", requester_id)
            .maybe_single()
            .execute()
        )

    result = await run_in_threadpool(_query)
    data = getattr(result, "data", None)
    return bool(data and data.get("verified"))


async def load_visible_post(post_id: str, requester_id: str | None) -> dict:
    """Return the post only if this requester is genuinely allowed to see it.

    Mirrors the `posts_select_*` RLS policies in supabase/schema.sql. If those
    policies change, this function has to change with them.
    """
    client = get_supabase_admin_client()

    def _query():
        return (
            client.table("posts")
            .select(POST_COLUMNS)
            .eq("id", post_id)
            .maybe_single()
            .execute()
        )

    result = await run_in_threadpool(_query)
    post = getattr(result, "data", None)
    if not post:
        raise _not_found()

    # The owning organisation always sees its own work, at any status.
    if requester_id and post["org_id"] == requester_id:
        return post

    if requester_id:
        role = await _fetch_profile_role(requester_id)
        if role == "admin":
            return post

    if post["status"] != "approved":
        raise _not_found()

    visibility = post["visibility"]
    if visibility == "public":
        return post
    if visibility == "registered" and requester_id:
        return post
    if visibility == "verified_org" and requester_id and await _is_verified_org(requester_id):
        return post

    raise _not_found()


async def load_owned_submission(submission_id: str) -> dict:
    """Load a raw_submissions row including the fields no client may ever see.

    storage_path and extracted_text are read here and never returned by any
    route — they exist only inside this process. That is the whole reason the
    client-facing `raw_submissions_review` view excludes them.
    """
    client = get_supabase_admin_client()

    def _query():
        return (
            client.table("raw_submissions")
            .select("*")
            .eq("id", submission_id)
            .maybe_single()
            .execute()
        )

    result = await run_in_threadpool(_query)
    submission = getattr(result, "data", None)
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="That submission does not exist.",
        )
    return submission
