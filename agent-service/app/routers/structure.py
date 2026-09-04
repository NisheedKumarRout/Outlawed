from fastapi import APIRouter, Depends

from app.deps import verify_internal_key
from app.schemas.request_schemas import StructureRequest
from app.schemas.response_schemas import StructureResponse
from app.services.structuring import structure_insight

router = APIRouter(tags=["agent"], dependencies=[Depends(verify_internal_key)])


@router.post("/structure", response_model=StructureResponse)
async def structure(payload: StructureRequest) -> StructureResponse:
    insight = await structure_insight(
        raw_text=payload.raw_text,
        organization_name=payload.organization_name,
        source_hint=payload.source_hint,
    )
    return StructureResponse(insight=insight)
