from fastapi import APIRouter, Depends

from app.deps import verify_internal_key
from app.schemas.request_schemas import SimilarCasesRequest
from app.schemas.response_schemas import SimilarCasesResponse
from app.services.similarity import find_similar_cases

router = APIRouter(tags=["agent"], dependencies=[Depends(verify_internal_key)])


@router.post("/similar-cases", response_model=SimilarCasesResponse)
async def similar_cases(payload: SimilarCasesRequest) -> SimilarCasesResponse:
    # Only approved posts are retrievable: both match_posts and
    # search_posts_lexical filter on status inside the SQL function, so an
    # unpublished insight cannot surface here regardless of who is asking.
    result = await find_similar_cases(
        query=payload.query,
        match_count=payload.match_count,
        filter_sector=payload.filter_sector,
        exclude_post_id=payload.exclude_post_id,
        # The ranked precedents are the useful output in this compact side
        # panel. A second Claude call for a prose briefing doubled latency and
        # made a successful search look broken to the user.
        with_briefing=False,
    )
    return SimilarCasesResponse(**result)
