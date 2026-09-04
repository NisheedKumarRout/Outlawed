from functools import lru_cache

from supabase import Client, create_client

from app.config import settings


@lru_cache(maxsize=1)
def get_supabase_admin_client() -> Client:
    """Service-role client: bypasses RLS. Never expose it outside agent-service."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("Supabase service credentials are not configured.")

    return create_client(settings.supabase_url, settings.supabase_service_role_key)
