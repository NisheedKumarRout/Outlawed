import logging

from fastapi import FastAPI

from app.config import settings
from app.deps import PLACEHOLDER_KEYS, verify_internal_key  # noqa: F401 (re-exported)
from app.routers import (
    applicability,
    discussion_summary,
    ingestion,
    rag_query,
    similar_cases,
    structure,
    translation,
)

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description=(
        "AI orchestration service for OUTLAWED OTR. Holds the model API key "
        "and the Supabase service-role key; never reachable from the browser."
    ),
)

# No CORS middleware, deliberately. Only the Next.js server calls this service,
# server to server, with the shared internal key. Allowing browser origins
# would be the one change that makes the internal key bypassable.

app.include_router(structure.router)
app.include_router(ingestion.router)
app.include_router(similar_cases.router)
app.include_router(applicability.router)
app.include_router(discussion_summary.router)
app.include_router(rag_query.router)
app.include_router(translation.router)


@app.get("/health", tags=["system"])
async def health() -> dict:
    """Reports which credentials are actually wired up.

    Deliberately reports presence, never values — this is the fastest way to
    diagnose "the AI features do nothing" without reading anyone's keys.
    """
    internal_key_ready = bool(
        settings.internal_api_key
        and settings.internal_api_key.strip().lower() not in PLACEHOLDER_KEYS
    )

    return {
        "status": "ok",
        "service": "agent-service",
        "environment": settings.environment,
        "provider": settings.ai_provider,
        "model": settings.active_ai_model,
        "credentials": {
            "gemini_api_key": bool(settings.gemini_api_key),
            "anthropic_api_key": bool(settings.anthropic_api_key),
            "supabase_service_role": bool(
                settings.supabase_url and settings.supabase_service_role_key
            ),
            "internal_api_key": internal_key_ready,
            "embeddings": settings.embeddings_enabled,
        },
        "features": {
            "structure": settings.ai_enabled,
            "redaction": bool(settings.ai_enabled and settings.supabase_service_role_key),
            "similar_cases": settings.ai_enabled,
            "similar_cases_mode": "vector" if settings.embeddings_enabled else "lexical",
            "applicability": settings.ai_enabled,
            "rag_chat": settings.ai_enabled,
            "kannada_translation": settings.ai_enabled,
        },
    }
