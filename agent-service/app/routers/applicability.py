from fastapi import APIRouter, Depends

from app.deps import verify_internal_key
from app.schemas.request_schemas import ApplicabilityRequest
from app.schemas.response_schemas import ApplicabilityResponse
from app.services.access import load_visible_post
from app.services.applicability import assess_applicability

router = APIRouter(tags=["agent"], dependencies=[Depends(verify_internal_key)])


@router.post("/applicability", response_model=ApplicabilityResponse)
async def applicability(payload: ApplicabilityRequest) -> ApplicabilityResponse:
    # Independent visibility check — this service bypasses RLS, so it re-derives
    # access rather than trusting that the Next.js route already did.
    post = await load_visible_post(payload.post_id, payload.requester_id)
    assessment = await assess_applicability(post, payload.requester_context)
    return ApplicabilityResponse(post_id=payload.post_id, assessment=assessment)
