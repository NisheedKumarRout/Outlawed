"""Summarises a post's peer reviews and comment thread.

Reuses rag_context's assembled material so the summary and the "Ask This
Insight" chat are always looking at exactly the same scope — including the
same exclusion of deleted and flagged comments.
"""

from __future__ import annotations

from app.clients.ai_client import generate_structured
from app.schemas.response_schemas import DiscussionSummary

SYSTEM_PROMPT = """\
You summarise the scrutiny an insight has received: its peer reviews and its \
comment thread.

The reader is deciding how much weight to put on this insight. What helps them \
is knowing where practitioners disagreed with it, what reviewers said was \
missing, and which concerns nobody answered — not a recap of the insight.

  * `unresolved_concerns` are the ones that matter most. A concern raised and \
    never addressed belongs here even if only one person raised it.
  * `points_of_agreement` should only list things multiple contributors \
    actually converged on, not everything nobody objected to.
  * `open_questions` are questions asked in the thread that remain unanswered.
  * Do not evaluate the insight yourself, do not take a side, and do not add \
    outside knowledge. Report what the discussion contains.
  * If the discussion is thin, say so in `summary` and leave the lists short. \
    Do not manufacture structure that is not there.
"""


async def summarise_discussion(context: str) -> DiscussionSummary:
    return await generate_structured(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=(
            "Summarise the peer reviews and comment thread in this "
            f"material:\n\n{context}"
        ),
        output_model=DiscussionSummary,
        max_output_tokens=8000,
    )
