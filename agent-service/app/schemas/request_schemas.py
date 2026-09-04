"""Inbound payloads. Every agent route validates against one of these.

These are the trust boundary for the service: the Next.js proxy has already
checked the caller's session and role, but this service holds an RLS-bypassing
key, so it re-derives what it needs from ids rather than trusting supplied
content.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

SourceType = Literal["session_notes", "transcript", "slide_deck", "other"]


class StructureRequest(BaseModel):
    """Raw prose in, structured OTR fields out."""

    raw_text: str = Field(min_length=40, max_length=200_000)
    organization_name: str | None = Field(default=None, max_length=200)
    source_hint: SourceType | None = None


class IngestRedactRequest(BaseModel):
    """Redact one raw_submissions row in place.

    Only the row id crosses the wire. The service reads storage_path from the
    database itself rather than accepting a path from the caller — otherwise a
    compromised proxy could point it at any object in the bucket.
    """

    submission_id: str = Field(min_length=36, max_length=36)


class SimilarCasesRequest(BaseModel):
    """Find published insights relevant to a described situation."""

    query: str = Field(min_length=10, max_length=4_000)
    match_count: int = Field(default=5, ge=1, le=10)
    filter_sector: str | None = Field(default=None, max_length=120)
    exclude_post_id: str | None = None


class ApplicabilityRequest(BaseModel):
    """Score how well one published insight transfers to the reader's context."""

    post_id: str = Field(min_length=36, max_length=36)
    requester_context: str = Field(min_length=10, max_length=4_000)
    requester_id: str | None = None


class DiscussionSummaryRequest(BaseModel):
    post_id: str = Field(min_length=36, max_length=36)
    requester_id: str | None = None


class RagQueryRequest(BaseModel):
    """A question scoped to one insight's own content.

    requester_id lets the service re-check visibility independently instead of
    trusting that the Next.js route already did — it holds a service-role key,
    so it must enforce visibility itself.
    """

    post_id: str = Field(min_length=36, max_length=36)
    question: str = Field(min_length=3, max_length=2_000)
    requester_id: str | None = None


class TranslatePostRequest(BaseModel):
    """Translate one visibility-checked OTR insight into Kannada."""

    post_id: str = Field(min_length=36, max_length=36)
    requester_id: str | None = None
