from fastapi import APIRouter, Depends

from app.deps import verify_internal_key
from app.schemas.request_schemas import TranslatePostRequest
from app.schemas.response_schemas import TranslatePostResponse
from app.services.translation import translate_post

router = APIRouter(tags=["agent"], dependencies=[Depends(verify_internal_key)])


@router.post("/translate", response_model=TranslatePostResponse)
async def translate(payload: TranslatePostRequest) -> TranslatePostResponse:
    return await translate_post(payload.post_id, payload.requester_id)
