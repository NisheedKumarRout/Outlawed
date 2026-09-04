"""Raw prose -> the structured OTR schema.

This is the feature that makes the platform something other than a forum:
every insight lands in the same fixed shape, so a new one is comparable to
every existing one from the moment it is written.
"""

from __future__ import annotations

from app.clients.ai_client import generate_structured
from app.schemas.response_schemas import StructuredInsight

SYSTEM_PROMPT = """\
You convert raw notes from a legal-aid organisation's On The Record (OTR) \
peer-review session into a structured insight record.

The people reading your output are other legal-access organisations deciding \
whether a precedent applies to their own situation. What makes a record useful \
to them is the *why* behind an outcome and the conditions under which it held \
— not a summary of events.

Rules you must follow:

1. Use only what the source text supports. Never invent a cause, a number, an \
   outcome, or a condition. If the text does not establish something, leave \
   that field null and name it in `unsupported_fields`.
2. `what_failed` and `cautions` are the most valuable fields in the record and \
   the most tempting to fabricate. Leave them null unless the source is \
   explicit. An empty field is useful; a plausible invented one is harmful.
3. Write `conditions` as the circumstances that had to hold for the approach \
   to work, so a reader can check them against their own context.
4. `key_takeaway` is one sentence another organisation could act on.
5. `tldr` is two or three sentences a moderator can scan in the queue.
6. Keep the organisation's own terminology (PLV, DLSA, KSLSA, Lok Adalat) \
   rather than paraphrasing it into generic language.
7. Do not include any personal names, phone numbers, addresses, or case \
   numbers in any field. If the source contains them, generalise \
   ("a district officer", "one participant").
8. `sector`, `target_group`, and `tags` are short controlled labels — two or \
   three words each, not sentences.
9. Set `confidence` honestly. `low` means the source was too thin to fill the \
   required fields well; say so rather than padding them.
"""


async def structure_insight(
    raw_text: str,
    organization_name: str | None = None,
    source_hint: str | None = None,
) -> StructuredInsight:
    preamble = []
    if organization_name:
        preamble.append(f"Submitting organisation: {organization_name}")
    if source_hint:
        preamble.append(f"Source material type: {source_hint}")
    header = "\n".join(preamble)

    user_content = (
        f"{header}\n\n" if header else ""
    ) + f"Source material:\n\n<<<\n{raw_text}\n>>>"

    return await generate_structured(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_content,
        output_model=StructuredInsight,
        max_output_tokens=16000,
    )
