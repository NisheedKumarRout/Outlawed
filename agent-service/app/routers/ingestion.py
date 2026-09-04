"""POST /ingest/redact — the only code in the system that touches raw uploads.

The original file is downloaded here with the service-role key, extracted, and
redacted. `extracted_text` and `storage_path` are written back to the row but
never returned by this route and never exposed through the client-facing
`raw_submissions_review` view.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from app.clients.supabase_client import get_supabase_admin_client
from app.config import settings
from app.deps import verify_internal_key
from app.schemas.request_schemas import IngestRedactRequest
from app.schemas.response_schemas import RedactionResponse
from app.services.access import load_owned_submission
from app.services.file_extraction import ExtractionError, extract_text
from app.services.redaction import redact_document

logger = logging.getLogger(__name__)

router = APIRouter(tags=["agent"], dependencies=[Depends(verify_internal_key)])


async def _mark_failed(submission_id: str, message: str) -> None:
    client = get_supabase_admin_client()

    def _update():
        return (
            client.table("raw_submissions")
            .update({"redaction_status": "failed", "redaction_error": message})
            .eq("id", submission_id)
            .execute()
        )

    await run_in_threadpool(_update)


@router.post("/ingest/redact", response_model=RedactionResponse)
async def redact_submission(payload: IngestRedactRequest) -> RedactionResponse:
    submission = await load_owned_submission(payload.submission_id)

    # Re-running a cleared submission would burn tokens and could overwrite a
    # redaction an admin has already reviewed.
    if submission.get("redaction_status") in {"cleared", "needs_manual_review"}:
        return RedactionResponse(
            submission_id=payload.submission_id,
            redaction_status=submission["redaction_status"],
            chunk_count=0,
            findings=[],
            residual_risk="none",
            reason="This submission has already been redacted.",
            redacted_text=submission.get("redacted_text"),
        )

    client = get_supabase_admin_client()
    storage_path = submission["storage_path"]

    def _download():
        return client.storage.from_(settings.storage_bucket).download(storage_path)

    try:
        file_bytes = await run_in_threadpool(_download)
    except Exception as exc:  # noqa: BLE001 - storage client raises broadly
        logger.exception("Could not download %s", storage_path)
        await _mark_failed(payload.submission_id, "The uploaded file could not be read.")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The uploaded file could not be retrieved from storage.",
        ) from exc

    try:
        text = extract_text(submission.get("original_filename") or storage_path, file_bytes)
    except ExtractionError as exc:
        await _mark_failed(payload.submission_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    if len(text) > settings.max_upload_chars:
        message = (
            f"Extracted text is {len(text):,} characters, over the "
            f"{settings.max_upload_chars:,} limit. Split the document and upload it in parts."
        )
        await _mark_failed(payload.submission_id, message)
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=message)

    try:
        result = await redact_document(text)
    except Exception as exc:  # noqa: BLE001 - surface as a row state, not a 500 only
        logger.exception("Redaction failed for submission %s", payload.submission_id)
        await _mark_failed(payload.submission_id, "The redaction pass did not complete.")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The redaction pass did not complete. The submission is marked failed.",
        ) from exc

    report = {
        "findings": [f.model_dump() for f in result["findings"]],
        "residual_risk": result["residual_risk"],
        "chunk_count": result["chunk_count"],
        "reason": result["reason"],
    }

    def _persist():
        return (
            client.table("raw_submissions")
            .update(
                {
                    "extracted_text": text,
                    "redacted_text": result["redacted_text"],
                    "redaction_report": report,
                    "redaction_status": result["redaction_status"],
                    "redaction_error": None,
                }
            )
            .eq("id", payload.submission_id)
            .execute()
        )

    await run_in_threadpool(_persist)

    return RedactionResponse(
        submission_id=payload.submission_id,
        redaction_status=result["redaction_status"],
        chunk_count=result["chunk_count"],
        findings=result["findings"],
        residual_risk=result["residual_risk"],
        reason=result["reason"],
        redacted_text=result["redacted_text"],
    )
