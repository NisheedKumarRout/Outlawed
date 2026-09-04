from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(PROJECT_ROOT / "agent-service" / ".env", override=True)


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    app_name: str = "OUTLAWED OTR Agent Service"
    environment: str = os.getenv("APP_ENV", "development")

    supabase_url: str | None = os.getenv("SUPABASE_URL")
    supabase_service_role_key: str | None = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    ai_provider: str = os.getenv("AI_PROVIDER", "gemini").strip().lower()
    gemini_api_key: str | None = os.getenv("GEMINI_API_KEY")
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY")
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    internal_api_key: str | None = os.getenv("INTERNAL_API_KEY")

    # Every generative feature uses one selected provider/model so prompts stay
    # consistent across structuring, redaction, translation, and grounded chat.
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    gemini_fallback_model: str = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.7-flash")
    claude_model: str = os.getenv("CLAUDE_MODEL", "claude-opus-5")

    # Embeddings are optional. Without a provider key, Similar Cases falls back
    # to Postgres full-text search (search_posts_lexical) and still works —
    # see services/similarity.py. The model and dimension here must match both
    # supabase/seed.py and the vector(1536) column in supabase/schema.sql.
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
    embedding_dimensions: int = _int_env("EMBEDDING_DIMENSIONS", 1536)

    storage_bucket: str = os.getenv("RAW_SUBMISSIONS_BUCKET", "raw-submissions")

    # Redaction chunking. Roughly 4 characters per token, so ~12k characters is
    # the ~3k-token window the architecture spec calls for. A document needing
    # more than max_auto_chunks passes to needs_manual_review instead of
    # cleared: more chunks means more chances the model missed an identifier.
    redaction_chunk_chars: int = _int_env("REDACTION_CHUNK_CHARS", 12_000)
    redaction_max_auto_chunks: int = _int_env("REDACTION_MAX_AUTO_CHUNKS", 3)
    max_upload_chars: int = _int_env("MAX_UPLOAD_CHARS", 400_000)

    request_timeout_seconds: float = float(os.getenv("AGENT_TIMEOUT_SECONDS", "120"))

    @property
    def embeddings_enabled(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def active_ai_model(self) -> str:
        return self.gemini_model if self.ai_provider == "gemini" else self.claude_model

    @property
    def ai_enabled(self) -> bool:
        if self.ai_provider == "gemini":
            return bool(self.gemini_api_key)
        if self.ai_provider == "anthropic":
            return bool(self.anthropic_api_key)
        return False


settings = Settings()
