# OUTLAWED OTR — Architecture Spec (v2)

Adds: automated PII redaction for raw session material, and a per-post RAG chat
assistant. Pair with `schema.sql` and `schema_additions.sql`.

## 1. File Hierarchy

```text
outlawed-otr/
├── agent-service/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── clients/
│   │   │   ├── claude_client.py
│   │   │   ├── embeddings_client.py
│   │   │   └── supabase_client.py
│   │   ├── routers/
│   │   │   ├── structure.py
│   │   │   ├── similar_cases.py
│   │   │   ├── applicability.py
│   │   │   ├── discussion_summary.py
│   │   │   ├── ingestion.py              # NEW  POST /ingest/redact
│   │   │   └── rag_query.py              # NEW  POST /rag-query (streaming)
│   │   ├── services/
│   │   │   ├── structuring.py
│   │   │   ├── similarity.py
│   │   │   ├── applicability.py
│   │   │   ├── embeddings.py
│   │   │   ├── redaction.py              # NEW  PII scan + redact + report
│   │   │   ├── file_extraction.py        # NEW  txt/docx/pdf/pptx -> plain text
│   │   │   └── rag_context.py            # NEW  assembles post+reviews+comments context
│   │   └── schemas/
│   │       ├── request_schemas.py
│   │       └── response_schemas.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── web/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── org-application/page.tsx
│   │   ├── (main)/
│   │   │   ├── layout.tsx
│   │   │   ├── feed/page.tsx
│   │   │   ├── search/page.tsx
│   │   │   ├── posts/
│   │   │   │   ├── [id]/page.tsx          # UPDATED: now renders AskInsightChat
│   │   │   │   ├── [id]/similar/page.tsx
│   │   │   │   └── new/page.tsx
│   │   │   ├── submissions/
│   │   │   │   ├── new/page.tsx           # NEW  raw file upload entry point
│   │   │   │   └── [id]/page.tsx          # NEW  org view of redaction status/preview
│   │   │   ├── compare/page.tsx
│   │   │   ├── organizations/[id]/page.tsx
│   │   │   ├── pinned/page.tsx
│   │   │   └── profile/page.tsx
│   │   ├── (admin)/
│   │   │   ├── layout.tsx
│   │   │   ├── admin-login/page.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── moderation/page.tsx
│   │   │   ├── ingestion-queue/page.tsx   # NEW  review redacted raw submissions
│   │   │   ├── verifications/page.tsx
│   │   │   ├── reports/page.tsx
│   │   │   └── knowledge-gaps/page.tsx
│   │   └── api/
│   │       ├── posts/route.ts
│   │       ├── posts/[id]/route.ts
│   │       ├── posts/[id]/feedback/route.ts
│   │       ├── comments/route.ts
│   │       ├── search/route.ts
│   │       ├── agent/
│   │       │   ├── structure/route.ts
│   │       │   ├── similar-cases/route.ts
│   │       │   ├── applicability/route.ts
│   │       │   ├── discussion-summary/route.ts
│   │       │   ├── ingest/route.ts        # NEW  registers upload, calls /ingest/redact
│   │       │   └── rag-query/route.ts     # NEW  streams from /rag-query
│   │       └── admin/moderation/route.ts
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── posts/
│   │   │   ├── PostCard.tsx
│   │   │   ├── PostDetail.tsx
│   │   │   ├── TLDRCard.tsx
│   │   │   ├── WhatWorkedFailedPanel.tsx
│   │   │   ├── ApplicabilityScore.tsx
│   │   │   ├── SimilarCasesList.tsx
│   │   │   ├── OTRSubmissionForm.tsx
│   │   │   └── AskInsightChat.tsx         # NEW  scoped RAG chat widget
│   │   ├── submissions/
│   │   │   ├── RawUploadForm.tsx          # NEW
│   │   │   └── RedactionReviewPanel.tsx   # NEW  shared by org + admin views
│   │   ├── comments/
│   │   ├── reviews/
│   │   ├── admin/
│   │   │   ├── ModerationQueueTable.tsx
│   │   │   ├── IngestionQueueTable.tsx    # NEW
│   │   │   ├── VerificationQueue.tsx
│   │   │   └── AdminStatCard.tsx
│   │   └── search/
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   ├── agent/agentClient.ts           # UPDATED: adds streaming support for rag-query
│   │   ├── auth/roles.ts
│   │   └── utils.ts
│   ├── middleware.ts
│   ├── types/database.types.ts
│   ├── tailwind.config.ts
│   ├── next.config.js
│   └── package.json
│
├── supabase/
│   ├── schema.sql
│   ├── schema_additions.sql               # NEW  raw_submissions + storage policies
│   ├── seed.sql
│   └── migrations/
│
└── README.md
```

## 2. PII Redaction & Secure Ingestion

**Scope decision for 24 hours:** support typed source material — `.txt`, `.docx`,
plain-text transcripts, and text pasted or exported from slides. OCR of scanned
photos or handwritten notes is explicitly out of scope; if a partner org only has
scanned pages, they paste the transcribed text instead. This is the single biggest
scope cut that keeps this feature buildable in the time you have.

**Flow:**

1. Org uploads the file directly from the browser to a **private** Supabase
   Storage bucket (`raw-submissions`) using `supabase-js`. This never touches
   your own servers — Supabase handles the upload, and the bucket's storage
   policies (see `schema_additions.sql`) already restrict access to the
   uploading org and admins, before any processing happens.
2. The client calls `POST /api/agent/ingest` with `{ storage_path, source_type }`.
   This route creates a `raw_submissions` row (`redaction_status = 'processing'`)
   and calls `agent-service`'s `POST /ingest/redact` **synchronously** — no job
   queue. At hackathon scale this is fine; a production version would move this
   to a background worker, which is a deliberate, stated non-goal here.
3. `agent-service`:
   - Downloads the file from Storage using the **service-role key** (the only
     place that ever touches the raw file).
   - Extracts plain text (`file_extraction.py` — straightforward parsing, no OCR).
   - Sends the text to Claude with a redaction-specific prompt: replace names,
     phone numbers, addresses, ID numbers, and other direct/indirect identifiers
     with typed placeholders (`[REDACTED: PERSON]`, `[REDACTED: LOCATION]`, etc.),
     and return a `redaction_report` listing what was found by category and count.
   - Long documents get chunked (~3,000 tokens each) and redacted independently;
     if a document needed more than a handful of chunks, `redaction_status` is
     set to `needs_manual_review` instead of `cleared` — more chunks means more
     chances the model missed something, so it should get a human's eyes before
     anyone builds an insight from it.
4. The row is updated: `redacted_text`, `redaction_report`, `redaction_status`.
   The original `extracted_text` (pre-redaction) and `storage_path` are **never
   exposed to any client**, including the admin UI — see the view below.
5. Cleared submissions land in the admin's new **Ingestion Queue**, a separate
   view from the post-moderation queue, since this is an earlier step: an admin
   confirms the redaction looks right, then the org (or admin, on their behalf)
   uses `redacted_text` as a starting reference to fill the structured OTR form —
   optionally, `/structure` can pre-fill draft field suggestions straight from
   `redacted_text`, so nobody re-types a transcript by hand.

**Why a view instead of trusting row-level security alone:** RLS is row-level,
not column-level. An org querying its own `raw_submissions` row would, by
default, also get back `extracted_text` and `storage_path` — the exact fields
that must never leave the agent-service. So the client (org and admin UI alike)
only ever queries `raw_submissions_review`, a view that excludes those two
columns entirely. `security_invoker = true` on the view means the underlying
table's RLS still applies to whoever is querying it — org sees its own, admin
sees all, nobody else sees anything.

**On "encrypted database state":** Supabase's Postgres and Storage already
encrypt data at rest by default — that part isn't something you build, it's
inherent to the platform. What you're actually responsible for is minimizing
who can reach the unredacted data at all: RLS scoping, the view that hides raw
fields, and short-lived signed URLs (generated server-side, never a public
path) if the original file ever needs to be viewed for audit.

## 3. Post-Level RAG Chat — "Ask This Insight"

**Why this doesn't need vector search:** the similar-cases feature retrieves
across the whole library, so it needs embeddings and `match_posts`. This
feature is scoped to one post — its structured fields, its peer reviews, its
comments — which together are a few paragraphs, easily small enough to hand to
Claude directly. No retrieval step, no embeddings, no vector index. That's the
difference between a multi-day feature and a few-hour one.

**Flow:**

1. On `posts/[id]/page.tsx`, `AskInsightChat.tsx` sends the user's question to
   `POST /api/agent/rag-query` with `{ post_id, question }`.
2. The Next.js route first does a normal `supabase-js` `select` for that post
   **as the logged-in user** — not the service role. If RLS returns nothing,
   the user can't see the post, so the route returns 403 before ever reaching
   the agent-service. This check is almost free: it's the same RLS policy
   already protecting the post everywhere else, just invoked here too.
3. The route forwards `{ post_id, question }` to `agent-service`'s
   `POST /rag-query`, requesting a streamed response.
4. `agent-service`, using the service-role key:
   - Re-checks the post's status independently (`approved`, or requester is the
     owning org/admin). **This is deliberate double-checking, not redundancy** —
     the agent-service holds a key that bypasses RLS entirely, so it must never
     assume a caller upstream already verified access. Every service that can
     see everything has to enforce visibility itself.
   - Assembles context: the post's structured fields, its `peer_reviews` rows,
     and its non-deleted, non-flagged `comments`.
   - Builds a system prompt that locks Claude to that context only: answer
     strictly from the material given; if the answer isn't in it, say so
     explicitly; never pull in outside knowledge or other insights.
   - Calls the Claude API with streaming enabled, and streams tokens back as
     they arrive rather than waiting for the full response.
5. The Next.js route pipes that stream straight through to the browser via the
   Web Streams API, so `AskInsightChat.tsx` renders tokens as they come in,
   the same feel as any AI chat interface.
6. Optional, non-blocking: log `{ post_id, question, answer }` pairs to a
   lightweight `rag_chat_logs` table for later review — useful for spotting
   which insights people are confused by, but skip it if time runs short.
