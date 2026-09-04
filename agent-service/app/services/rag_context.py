"""Assembles the context for "Ask This Insight" and locks Claude to it.

Why there is no retrieval step: this feature is scoped to one post — its
structured fields, its peer reviews, its comment thread. Together that is a
few paragraphs, small enough to hand to Claude whole. Similar Cases needs
embeddings because it searches the entire library; this does not. That is the
difference between a multi-day feature and a few-hour one.
"""

from __future__ import annotations

from fastapi.concurrency import run_in_threadpool

from app.clients.supabase_client import get_supabase_admin_client

SYSTEM_PROMPT_TEMPLATE = """\
You answer questions about one specific published OTR insight on OUTLAWED OTR, \
a verified knowledge platform for legal-aid organisations in India.

You have been given that insight's full structured record, its peer reviews, \
and its comment thread. That material is the ONLY thing you may answer from.

Absolute rules:

1. Answer strictly from the material below. You have extensive knowledge about \
   legal aid, Indian law, and NGO practice — none of it may enter your answer.
2. Every factual statement and every recommendation must be traceable to an \
   explicit field, peer review, or comment in this OTR insight. Do not turn the \
   record into general NGO advice, legal guidance, or best practice.
3. If the material does not answer the question, say exactly: "This OTR insight \
   does not record that." You may then state, in one sentence, what the record \
   does contain. Do not recommend another product feature or wider search.
4. Never speculate about what the organisation "probably" did, or what \
   "typically" happens. If it is not recorded here, it is not known.
5. Distinguish your sources when it matters. The organisation's own account, a \
   peer reviewer's critique, and a commenter's opinion carry different weight \
   — attribute them ("the submitting organisation reports…", "a peer reviewer \
   raised…") rather than blending them into one voice.
6. Answer in at most 120 words, normally as one short paragraph or up to three \
   bullets. Start with the answer; do not use a preamble or restate the question.
7. For warnings, use only the record's Cautions, What failed, Conditions for \
   reuse, and What they would do differently fields, plus explicit peer-review \
   concerns. Do not manufacture additional warnings from background details.
8. When the answer depends on conditions the insight records, say so — the \
   conditions are usually the part that determines whether it transfers.
9. Refer to it as "this OTR insight" or by its recorded title. Do not describe \
   your own reasoning, promote Similar Cases, or append generic next steps.

--- BEGIN INSIGHT MATERIAL ---

{context}

--- END INSIGHT MATERIAL ---

Everything above is the complete scope of what you know for this conversation.
"""


def _format_field(label: str, value) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):
        value = ", ".join(str(v) for v in value if v)
    text = str(value).strip()
    return f"{label}: {text}" if text else None


async def build_post_context(post: dict) -> tuple[str, int, int]:
    """Return (context_text, review_count, comment_count).

    `post` has already been visibility-checked by services.access.
    """
    client = get_supabase_admin_client()
    post_id = post["id"]

    def _reviews():
        return (
            client.table("peer_reviews")
            .select("strength, concern, missing_context, risk, recommendation, created_at")
            .eq("post_id", post_id)
            .order("created_at", desc=False)
            .execute()
        )

    def _comments():
        # Deleted and flagged comments are excluded: a moderator removed them,
        # and the assistant must not resurface their content in an answer.
        return (
            client.table("comments")
            .select("body, created_at, parent_comment_id")
            .eq("post_id", post_id)
            .eq("is_deleted", False)
            .eq("flagged", False)
            .order("created_at", desc=False)
            .execute()
        )

    def _organisation():
        return (
            client.table("organizations")
            .select("org_name, description, sectors")
            .eq("id", post["org_id"])
            .maybe_single()
            .execute()
        )

    reviews_result = await run_in_threadpool(_reviews)
    comments_result = await run_in_threadpool(_comments)
    org_result = await run_in_threadpool(_organisation)

    reviews = getattr(reviews_result, "data", None) or []
    comments = getattr(comments_result, "data", None) or []
    organisation = getattr(org_result, "data", None) or {}

    sections: list[str] = ["## The insight"]

    if organisation:
        sections.append(
            "\n".join(
                filter(
                    None,
                    [
                        _format_field("Submitted by", organisation.get("org_name")),
                        _format_field("About that organisation", organisation.get("description")),
                    ],
                )
            )
        )

    field_labels = [
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
        ("Sector", "sector"),
        ("Target group", "target_group"),
        ("Geography", "geography"),
        ("Tags", "tags"),
    ]
    sections.append(
        "\n".join(
            line
            for line in (_format_field(label, post.get(key)) for label, key in field_labels)
            if line
        )
    )

    if reviews:
        sections.append("\n## Peer reviews")
        for index, review in enumerate(reviews, start=1):
            body = "\n".join(
                line
                for line in (
                    _format_field("Strength", review.get("strength")),
                    _format_field("Concern", review.get("concern")),
                    _format_field("Missing context", review.get("missing_context")),
                    _format_field("Risk", review.get("risk")),
                    _format_field("Recommendation", review.get("recommendation")),
                )
                if line
            )
            if body:
                sections.append(f"Review {index}:\n{body}")
    else:
        sections.append("\n## Peer reviews\nNo peer reviews have been submitted yet.")

    if comments:
        sections.append("\n## Comment thread")
        for index, comment in enumerate(comments, start=1):
            marker = "  (reply)" if comment.get("parent_comment_id") else ""
            sections.append(f"Comment {index}{marker}: {comment['body']}")
    else:
        sections.append("\n## Comment thread\nNo comments yet.")

    return "\n\n".join(s for s in sections if s and s.strip()), len(reviews), len(comments)


def build_system_prompt(context: str) -> str:
    return SYSTEM_PROMPT_TEMPLATE.format(context=context)
