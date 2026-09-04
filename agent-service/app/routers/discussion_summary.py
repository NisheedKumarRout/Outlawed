from fastapi import APIRouter, Depends

from app.deps import verify_internal_key
from app.schemas.request_schemas import DiscussionSummaryRequest
from app.schemas.response_schemas import DiscussionSummaryResponse
from app.services.access import load_visible_post
from app.services.discussion import summarise_discussion
from app.services.rag_context import build_post_context

router = APIRouter(tags=["agent"], dependencies=[Depends(verify_internal_key)])


@router.post("/discussion-summary", response_model=DiscussionSummaryResponse)
async def discussion_summary(payload: DiscussionSummaryRequest) -> DiscussionSummaryResponse:
    post = await load_visible_post(payload.post_id, payload.requester_id)
    context, review_count, comment_count = await build_post_context(post)

    # Nothing to summarise is a normal state, not an error — say so instead of
    # asking Claude to produce structure out of an empty thread.
    if review_count == 0 and comment_count == 0:
        return DiscussionSummaryResponse(
            post_id=payload.post_id,
            comment_count=0,
            review_count=0,
            summary=None,
            message="No peer reviews or comments yet.",
        )

    return DiscussionSummaryResponse(
        post_id=payload.post_id,
        comment_count=comment_count,
        review_count=review_count,
        summary=await summarise_discussion(context),
    )
