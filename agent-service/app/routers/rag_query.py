"""POST /rag-query — "Ask This Insight", streamed.

Streaming end to end: AI provider -> FastAPI StreamingResponse -> the Next.js route
pipes it through -> the browser renders tokens as they arrive.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from app.clients.ai_client import stream_text
from app.clients.supabase_client import get_supabase_admin_client
from app.deps import verify_internal_key
from app.schemas.request_schemas import RagQueryRequest
from app.services.access import load_visible_post
from app.services.rag_context import build_post_context, build_system_prompt

logger = logging.getLogger(__name__)

router = APIRouter(tags=["agent"], dependencies=[Depends(verify_internal_key)])


async def _log_exchange(post_id: str, user_id: str | None, question: str, answer: str) -> None:
    """Best-effort. A logging failure must never break an answer already sent."""
    try:
        client = get_supabase_admin_client()

        def _insert():
            return (
                client.table("rag_chat_logs")
                .insert(
                    {
                        "post_id": post_id,
                        "user_id": user_id,
                        "question": question,
                        "answer": answer,
                    }
                )
                .execute()
            )

        await run_in_threadpool(_insert)
    except Exception:  # noqa: BLE001
        logger.warning("Could not log RAG exchange for post %s", post_id, exc_info=True)


@router.post("/rag-query")
async def rag_query(payload: RagQueryRequest) -> StreamingResponse:
    # The visibility check happens BEFORE the stream opens, so an unauthorised
    # request gets a clean 404 rather than a 200 whose body turns out to be an
    # error the client has to parse out of a token stream.
    post = await load_visible_post(payload.post_id, payload.requester_id)
    context, _reviews, _comments = await build_post_context(post)
    system_prompt = build_system_prompt(context)

    async def token_stream():
        collected: list[str] = []
        try:
            async for text in stream_text(
                system_prompt=system_prompt,
                user_prompt=payload.question,
                max_output_tokens=4000,
            ):
                collected.append(text)
                yield text
        except Exception:  # noqa: BLE001
            logger.exception("RAG stream failed for post %s", payload.post_id)
            # The response has already begun with a 200, so the only way to
            # tell the reader something broke is inside the stream itself.
            yield "\n\n[The answer could not be completed. Please try again.]"
            return

        await _log_exchange(
            payload.post_id, payload.requester_id, payload.question, "".join(collected)
        )

    return StreamingResponse(
        token_stream(),
        media_type="text/plain; charset=utf-8",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
