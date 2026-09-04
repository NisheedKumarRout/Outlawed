"""PII scan and redaction over raw session material.

Runs before a human ever reads the document, so an organisation can share real
session notes without a manual redaction burden blocking every submission.

Two deliberate conservatisms:

  * A document that needed more than `redaction_max_auto_chunks` passes to
    `needs_manual_review` rather than `cleared`. More chunks means more
    independent chances the model missed an identifier, and nobody should
    build a published insight off material that was never checked by a person.
  * Any chunk reporting residual risk above "low" downgrades the whole
    document the same way. One uncertain paragraph is enough.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict

from app.clients.ai_client import generate_structured
from app.config import settings
from app.schemas.response_schemas import RedactionChunkResult, RedactionFinding

SYSTEM_PROMPT = """\
You are a redaction pass over raw material from a legal-aid organisation's \
session notes, transcripts, or slides. This material concerns vulnerable \
people seeking legal help, so the cost of leaving an identifier in is high.

Replace every direct and indirect identifier with a typed placeholder:

  [REDACTED: PERSON]        names, initials, nicknames, relationship handles \
                            that identify one person ("Ramesh's wife")
  [REDACTED: LOCATION]      villages, neighbourhoods, streets, landmarks, and \
                            any address more specific than a district
  [REDACTED: PHONE]         phone and fax numbers
  [REDACTED: EMAIL]         email addresses
  [REDACTED: ID_NUMBER]     Aadhaar, PAN, voter ID, ration card, any national \
                            or state identifier
  [REDACTED: CASE_NUMBER]   case, FIR, petition, and docket numbers
  [REDACTED: DATE_OF_BIRTH] dates of birth and exact ages of individuals
  [REDACTED: FINANCIAL]     bank accounts, individual payment amounts tied to \
                            a named person
  [REDACTED: ORGANISATION]  small private employers or named private parties \
                            that would identify an individual
  [REDACTED: OTHER]         anything else that could single someone out

Preserve, do NOT redact:

  * Public institutions and their offices — KSLSA, DLSA, NALSA, Lok Adalat, \
    district and taluk legal services authorities, courts, police departments \
    as institutions. These are the subject matter, not personal data.
  * Job titles and roles held generically — "the district judge", "a PLV", \
    "the panel advocate", "a member secretary".
  * District and state names. Geography at district level is analytically \
    essential and is not itself identifying.
  * Every substantive fact: what happened, what worked, what failed, numbers, \
    dates of events, and all reasoning. Redaction must not remove meaning.

Output rules:

  * Return the full chunk with substitutions applied. Do not summarise, \
    shorten, reorder, or comment on it. Length should be close to the input.
  * Report findings as counts by category. Never repeat a redacted value in \
    the findings — that would defeat the purpose.
  * Set `residual_risk` honestly. Use "medium" or "high" if the text contains \
    indirect identifiers you could not fully neutralise without destroying \
    meaning (for example, a description so specific that only one person in a \
    district could match it), and explain in `residual_note` without quoting \
    the value.
"""


def chunk_text(text: str, chunk_chars: int) -> list[str]:
    """Split on paragraph boundaries so a redaction never straddles a sentence."""
    if len(text) <= chunk_chars:
        return [text]

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for paragraph in text.split("\n\n"):
        block = paragraph + "\n\n"

        # A single paragraph longer than the window gets hard-split on lines.
        if len(block) > chunk_chars:
            if current:
                chunks.append("".join(current).strip())
                current, current_len = [], 0
            for i in range(0, len(block), chunk_chars):
                chunks.append(block[i : i + chunk_chars].strip())
            continue

        if current_len + len(block) > chunk_chars and current:
            chunks.append("".join(current).strip())
            current, current_len = [], 0

        current.append(block)
        current_len += len(block)

    if current:
        chunks.append("".join(current).strip())

    return [c for c in chunks if c]


async def _redact_chunk(chunk: str, index: int, total: int) -> RedactionChunkResult:
    return await generate_structured(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=(
            f"Chunk {index} of {total}. Redact it and return the full text.\n\n"
            f"<<<\n{chunk}\n>>>"
        ),
        output_model=RedactionChunkResult,
        max_output_tokens=32000,
    )


RISK_ORDER = {"none": 0, "low": 1, "medium": 2, "high": 3}


async def redact_document(text: str) -> dict:
    """Redact a whole document and decide whether it can clear automatically."""
    chunks = chunk_text(text, settings.redaction_chunk_chars)

    # Chunks are independent, so they run concurrently. A 5-chunk transcript
    # takes about as long as a 1-chunk one.
    results: list[RedactionChunkResult] = list(
        await asyncio.gather(
            *(_redact_chunk(chunk, i + 1, len(chunks)) for i, chunk in enumerate(chunks))
        )
    )

    redacted_text = "\n\n".join(r.redacted_text.strip() for r in results)

    totals: dict[str, int] = defaultdict(int)
    notes: dict[str, str] = {}
    for result in results:
        for finding in result.findings:
            totals[finding.category] += finding.count
            if finding.note and finding.category not in notes:
                notes[finding.category] = finding.note

    findings = [
        RedactionFinding(category=category, count=count, note=notes.get(category))
        for category, count in sorted(totals.items(), key=lambda kv: -kv[1])
    ]

    worst_risk = max(
        (r.residual_risk for r in results), key=lambda r: RISK_ORDER[r], default="none"
    )
    residual_notes = [r.residual_note for r in results if r.residual_note]

    status_value = "cleared"
    reason: str | None = None

    if len(chunks) > settings.redaction_max_auto_chunks:
        status_value = "needs_manual_review"
        reason = (
            f"Document was split into {len(chunks)} chunks "
            f"(auto-clear limit is {settings.redaction_max_auto_chunks}). "
            "Longer documents get a human check before anything is built from them."
        )
    elif RISK_ORDER[worst_risk] >= RISK_ORDER["medium"]:
        status_value = "needs_manual_review"
        reason = "The model flagged indirect identifiers it could not fully neutralise. " + (
            residual_notes[0] if residual_notes else ""
        )

    return {
        "redacted_text": redacted_text,
        "findings": findings,
        "residual_risk": worst_risk,
        "chunk_count": len(chunks),
        "redaction_status": status_value,
        "reason": reason,
    }
