"""Outbound payloads.

The models marked "structured output" are handed to the selected provider as
JSON schemas and validated by Pydantic before this service uses the result.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# /structure
# ---------------------------------------------------------------------------


class StructuredInsight(BaseModel):
    """Structured output: the OTR schema, one field per posts column.

    Optional fields are genuinely optional — the prompt instructs Claude to
    leave them null rather than invent content the source text does not
    support, because a fabricated "what failed" is worse than an empty one.
    """

    title: str = Field(description="A specific, reusable one-line learning.")
    problem: str = Field(description="The practical problem the organisation set out to solve.")
    context: str = Field(description="Who, where, and under what conditions.")
    approach: str = Field(description="What the organisation actually did.")
    evidence_outcome: str = Field(description="What changed and what supports that conclusion.")
    key_takeaway: str = Field(description="What another organisation should remember.")

    what_worked: str | None = None
    what_failed: str | None = None
    why_worked_or_failed: str | None = None
    conditions: str | None = None
    cautions: str | None = None
    would_do_differently: str | None = None

    sector: list[str] = Field(default_factory=list)
    target_group: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    geography: str | None = None

    tldr: str = Field(description="Two or three sentences an admin can scan.")
    confidence: Literal["high", "medium", "low"] = Field(
        description="How well the source text actually supported these fields."
    )
    unsupported_fields: list[str] = Field(
        default_factory=list,
        description="Fields left empty because the source text did not cover them.",
    )


class StructureResponse(BaseModel):
    insight: StructuredInsight


# ---------------------------------------------------------------------------
# /ingest/redact
# ---------------------------------------------------------------------------


class RedactionFinding(BaseModel):
    category: Literal[
        "PERSON",
        "LOCATION",
        "PHONE",
        "EMAIL",
        "ID_NUMBER",
        "ORGANISATION",
        "DATE_OF_BIRTH",
        "CASE_NUMBER",
        "FINANCIAL",
        "OTHER",
    ]
    count: int = Field(ge=0)
    note: str | None = Field(
        default=None, description="Why these were treated as identifying. No raw values."
    )


class RedactionChunkResult(BaseModel):
    """Structured output for a single chunk of a document."""

    redacted_text: str = Field(
        description="The chunk with every identifier replaced by a typed placeholder."
    )
    findings: list[RedactionFinding] = Field(default_factory=list)
    residual_risk: Literal["none", "low", "medium", "high"] = Field(
        description="Confidence that nothing identifying remains."
    )
    residual_note: str | None = None


class RedactionResponse(BaseModel):
    submission_id: str
    redaction_status: Literal["cleared", "needs_manual_review", "failed"]
    chunk_count: int
    findings: list[RedactionFinding]
    residual_risk: Literal["none", "low", "medium", "high"]
    reason: str | None = None
    # The redacted body is returned so the UI can show it immediately; it is
    # also persisted. The pre-redaction text is never returned by any route.
    redacted_text: str | None = None


# ---------------------------------------------------------------------------
# /similar-cases
# ---------------------------------------------------------------------------


class SimilarCase(BaseModel):
    post_id: str
    title: str
    organization_name: str | None = None
    similarity: float
    why_relevant: str
    key_takeaway: str | None = None
    sector: list[str] = Field(default_factory=list)
    geography: str | None = None


class SimilarCaseRanking(BaseModel):
    """Structured output: Claude's re-rank of the candidates it was shown."""

    post_id: str
    relevance: int = Field(ge=0, le=100, description="0-100 fit against the described situation.")
    why_relevant: str = Field(
        description="One or two sentences naming the specific overlap, not a generic restatement."
    )


class SimilarCasesRanking(BaseModel):
    rankings: list[SimilarCaseRanking]


class SimilarCasesResponse(BaseModel):
    query: str
    retrieval_mode: Literal["vector", "lexical", "recent"]
    results: list[SimilarCase]
    briefing: str | None = None


# ---------------------------------------------------------------------------
# /applicability
# ---------------------------------------------------------------------------


class ApplicabilityAssessment(BaseModel):
    """Structured output: how well this insight transfers, and on what terms."""

    score: int = Field(ge=0, le=100)
    verdict: Literal["strong_match", "partial_match", "weak_match"]
    matching_conditions: list[str] = Field(default_factory=list)
    divergent_conditions: list[str] = Field(default_factory=list)
    cautions: list[str] = Field(default_factory=list)
    recommended_next_steps: list[str] = Field(default_factory=list)
    rationale: str


class ApplicabilityResponse(BaseModel):
    post_id: str
    assessment: ApplicabilityAssessment


# ---------------------------------------------------------------------------
# /discussion-summary
# ---------------------------------------------------------------------------


class DiscussionSummary(BaseModel):
    """Structured output over a post's peer reviews and comment thread."""

    summary: str
    open_questions: list[str] = Field(default_factory=list)
    unresolved_concerns: list[str] = Field(default_factory=list)
    points_of_agreement: list[str] = Field(default_factory=list)


class DiscussionSummaryResponse(BaseModel):
    post_id: str
    comment_count: int
    review_count: int
    summary: DiscussionSummary | None = None
    message: str | None = None


# ---------------------------------------------------------------------------
# /translate
# ---------------------------------------------------------------------------


class KannadaPostTranslation(BaseModel):
    """A field-for-field translation, never a summary or reinterpretation."""

    title: str
    problem: str
    context: str
    approach: str
    evidence_outcome: str
    key_takeaway: str
    what_worked: str | None = None
    what_failed: str | None = None
    why_worked_or_failed: str | None = None
    conditions: str | None = None
    cautions: str | None = None
    would_do_differently: str | None = None
    tldr: str | None = None


class TranslatePostResponse(BaseModel):
    post_id: str
    language_code: Literal["kn"] = "kn"
    language_name: str = "Kannada"
    cached: bool
    translation: KannadaPostTranslation
