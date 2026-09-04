"""Shared FastAPI dependencies.

Lives outside main.py so routers can import the auth dependency without a
circular import back through the app object.
"""

from __future__ import annotations

import secrets

from fastapi import Header, HTTPException, status

from app.config import settings

PLACEHOLDER_KEYS = {
    "replace_with_the_same_long_random_secret_used_by_next",
    "replace_with_a_long_random_shared_secret",
    "changeme",
    "",
}


async def verify_internal_key(
    x_internal_key: str | None = Header(default=None, alias="X-Internal-Key"),
) -> None:
    """Only the Next.js server may call the metered agent routes.

    The browser never reaches this service directly: every AI feature goes
    through a Next.js route that checks the caller's session and role first.
    This header is what stops someone who discovers the service URL from
    spending the Claude budget directly.
    """
    configured = settings.internal_api_key

    if not configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="INTERNAL_API_KEY is not configured.",
        )

    # A shipped placeholder is the same as no secret at all — it is published
    # in .env.example, so anyone can read it out of the repository.
    if configured.strip().lower() in PLACEHOLDER_KEYS:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "INTERNAL_API_KEY is still the placeholder value from "
                ".env.example. Generate a real shared secret before serving "
                "agent routes."
            ),
        )

    if not x_internal_key or not secrets.compare_digest(x_internal_key, configured):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal API key.",
        )
