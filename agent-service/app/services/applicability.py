"""Applicability: does this specific insight transfer to *your* situation?

Distinct from Similar Cases. Similar Cases asks "which of these many insights
is relevant"; applicability takes one insight the reader is already looking at
and works out, against the conditions that insight itself records, whether it
would hold in their context — and what to check before assuming it does.
"""

from __future__ import annotations

from app.clients.ai_client import generate_structured
from app.schemas.response_schemas import ApplicabilityAssessment

SYSTEM_PROMPT = """\
You assess whether one published insight from a legal-aid organisation \
transfers to a different organisation's described situation.

You are given the insight's full structured record — including the conditions \
under which its approach worked and the cautions its authors recorded — and \
the reader's own context.

How to score:

  * The conditions field is the centre of this judgement. An approach that \
    succeeded because a specific institutional dependency held does not \
    transfer to a context where that dependency is absent, however similar the \
    two look on the surface.
  * Sector, target population, and geography overlap matter, but they are \
    weaker signals than matching operating conditions. Do not let surface \
    similarity inflate the score.
  * score 75-100 (strong_match): conditions substantially hold; it can be \
    adapted with the recorded cautions in mind.
    score 40-74 (partial_match): the problem rhymes but at least one load- \
    bearing condition differs or is unknown.
    score 0-39 (weak_match): the underlying mechanism does not carry over.
  * Being unable to tell is a real finding. If the reader's context omits \
    something load-bearing, put it in `divergent_conditions` as an unknown \
    they need to establish, and cap the score accordingly.

`matching_conditions` and `divergent_conditions` are short, concrete, and \
specific to these two situations — never generic statements that would be \
true of any pair. `recommended_next_steps` are things this reader could \
actually do next, drawn from what the insight records.

Ground everything in the insight and the stated context. Do not introduce \
outside knowledge about legal aid practice.
"""


def _describe_post(post: dict) -> str:
    fields = [
        ("Title", "title"),
        ("Problem", "problem"),
        ("Context", "context"),
        ("Approach", "approach"),
        ("Evidence and outcome", "evidence_outcome"),
        ("What worked", "what_worked"),
        ("What failed", "what_failed"),
        ("Why it worked or failed", "why_worked_or_failed"),
        ("Conditions for reuse", "conditions"),
        ("Cautions", "cautions"),
        ("What they would do differently", "would_do_differently"),
        ("Key takeaway", "key_takeaway"),
    ]

    lines = []
    for label, key in fields:
        value = post.get(key)
        if value:
            lines.append(f"{label}: {value}")

    for label, key in (("Sector", "sector"), ("Target group", "target_group")):
        values = post.get(key) or []
        if values:
            lines.append(f"{label}: {', '.join(values)}")

    if post.get("geography"):
        lines.append(f"Geography: {post['geography']}")

    return "\n".join(lines)


async def assess_applicability(post: dict, requester_context: str) -> ApplicabilityAssessment:
    return await generate_structured(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=(
            "The published insight:\n\n"
            f"{_describe_post(post)}\n\n"
            "The reader's own situation:\n\n"
            f"{requester_context}"
        ),
        output_model=ApplicabilityAssessment,
        max_output_tokens=16000,
    )
