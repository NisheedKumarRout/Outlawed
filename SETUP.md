# OUTLAWED OTR — Setup & Operations

Current state of your environment, verified on 2026-08-23:

| Thing | Status |
|---|---|
| Supabase project | Live — 6 profiles, 4 organisations, 8 seeded posts |
| `raw-submissions` storage bucket | Exists, private |
| `GEMINI_API_KEY` | Set and working (verified with live structuring, translation, redaction, RAG, applicability, and re-ranking calls) |
| `SUPABASE_SERVICE_ROLE_KEY` | Set and working |
| `INTERNAL_API_KEY` | Set — real 64-char secret, matched across `.env` and `web/.env.local` |
| Database schema | **Two additive migrations to run (step 1)** |
| `OPENAI_API_KEY` | Not set — optional, see step 4 |

---

## 1. Run the pending migrations — REQUIRED

The application now has three explicit surfaces: read-only readers, verified
organizations, and the OutLawed operator portal. One migration closes the
direct-database write paths for reader accounts:

- Readers remain able to search and read approved posts.
- Comments, votes, feedback, and pins require an organization or reviewer role.
- Organization submission and upload routes remain separately role-gated.
- Admin decisions continue to use the existing admin-only RLS policies.

**How:** open the Supabase dashboard → SQL Editor → New query → paste the whole
of `supabase/migrations/20260823050000_reader_organization_boundaries.sql` → Run.

Then open another new query and run
`supabase/migrations/20260823060000_kannada_translations.sql`. This creates the
source-versioned Kannada cache so each post is translated once and reused even
after the agent service restarts.

Every statement is idempotent, so re-running it is harmless.

> **Do not run `schema_additions.sql`.** It duplicates content already in
> `supabase/schema.sql` and aborts with `type "submission_source" already
> exists`. The file now contains only a notice saying so.
>
> `supabase/schema.sql` is for a **fresh** database only, and now includes
> every fix folded in. Never run it against your existing project.

---

## 2. Install the Python dependencies

Three new packages are needed for the ingestion pipeline (document parsing):

```bash
.venv/Scripts/python.exe -m pip install -r agent-service/requirements.txt
```

Already installed in your `.venv`: `python-docx`, `pypdf`, `python-pptx`.

---

## 3. Run both services

### In VS Code (recommended)

Open **`C:\Users\madha\Team-43`** — the repository root, not `web/`. Then press
**F5** and choose **"Run everything"**.

First time only:

1. Install the recommended extensions when VS Code prompts (or `Ctrl+Shift+X`
   → type `@recommended` → install).
2. `Ctrl+Shift+P` → `Python: Select Interpreter` → `.\.venv\Scripts\python.exe`.
3. `Ctrl+Shift+P` → `Tasks: Run Task` → **Install: everything**.

If a dev server from an earlier session is holding a port, run the
**Free ports 3000, 3001 and 8000** task first — Next refuses to start a second dev
server and exits.

Other configs in the debug dropdown (`Ctrl+Shift+D`): each service on its own,
**Seed the database**, and **Backfill embeddings**. Useful tasks: **Check:
agent-service credentials**, typecheck, lint, production build.

Breakpoints work in both stacks. `subProcess: true` in `launch.json` is what
makes them bind inside `uvicorn --reload`'s child process rather than only the
supervisor.

### Or three terminals

```bash
# Terminal 1 — the AI service (holds the Gemini key and the service-role key)
cd agent-service
../.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — the web app
cd web
npm run dev

# Terminal 3 — the separate OutLawed operator website
cd web
npm run dev:admin
```

- Reader + organization website: `http://localhost:3000`
- OutLawed admin website: `http://localhost:3001`

Deploy the `web` directory twice for production. The public deployment uses
`PORTAL_MODE=public`; the admin deployment uses `PORTAL_MODE=admin`. Both use
the same Supabase project. Configure `PUBLIC_APP_URL` and `ADMIN_PORTAL_URL`
with the two real domains so cross-portal links and redirects stay separated.

`http://127.0.0.1:8000/health` reports which credentials are actually wired
up, without printing any of them. Check it first whenever an AI feature seems
to do nothing:

```json
{
  "provider": "gemini",
  "model": "gemini-3.6-flash",
  "credentials": { "gemini_api_key": true, "internal_api_key": true, "embeddings": false },
  "features": { "rag_chat": true, "similar_cases_mode": "lexical" }
}
```

`http://127.0.0.1:8000/docs` gives you a live API console for all six AI routes.

---

## 4. `OPENAI_API_KEY` — optional

**Everything works without this.** It only upgrades Similar Cases retrieval
from Postgres full-text search to vector similarity.

The `posts.embedding` column is `vector(1536)` to match OpenAI's
`text-embedding-3-small` — which is also what `supabase/seed.py` uses. Rather
than let a missing embedding key break a headline feature, retrieval falls
back to `search_posts_lexical`, and Gemini still does the contextual re-ranking
and the "why relevant" explanation either way. At 8 seeded posts the difference
is small.

To enable it:

1. Add `OPENAI_API_KEY=sk-...` to the repository-root `.env`.
2. Backfill vectors for the existing posts:
   ```bash
   .venv/Scripts/python.exe agent-service/scripts/backfill_embeddings.py
   ```
3. `/health` will flip to `"similar_cases_mode": "vector"`.

If you switch embedding models, change the dimension in **three** places or
similarity scores go silently wrong rather than erroring: `supabase/schema.sql`
(the column and both RPCs), `supabase/seed.py`, and `EMBEDDING_MODEL` /
`EMBEDDING_DIMENSIONS` in `.env`.

---

## 5. Keys — what lives where, and why

| Key | Location | Reaches the browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `web/.env.local` | Yes — safe, RLS is the boundary |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `web/.env.local` | Yes — safe, RLS is the boundary |
| `SUPABASE_SERVICE_ROLE_KEY` | root `.env` | **Never.** Bypasses RLS entirely |
| `GEMINI_API_KEY` | root `.env` | **Never.** agent-service only |
| `INTERNAL_API_KEY` | both `.env` files | **Never.** Shared secret, server to server |

`INTERNAL_API_KEY` must be **identical** in `.env` and `web/.env.local` — it is
what proves to the agent service that a request came from your Next.js server
and not from someone who found the service URL. Both files now hold the same
generated 64-character secret.

The service refuses to serve any AI route while that value is still the
placeholder from `.env.example`, and returns 503 explaining why — a published
placeholder is the same as no secret at all.

Both `.env` files are covered by `.gitignore`. If you deploy the agent service
anywhere public, put it behind the same shared secret and do not expose port
8000 to the internet.

---

## 6. The demo loop

Run this end to end before presenting, in two browser windows (an org account
and an individual account).

- [ ] Individual signs up → a `profiles` row appears automatically (the
      `handle_new_user` trigger)
- [ ] Org uploads raw notes at `/submissions/new` → redaction report shows
      identifier counts by category, never the values
- [ ] Admin clears it in `/ingestion-queue`
- [ ] Org opens `/posts/new`, clicks **Start from raw notes**, pastes the
      redacted text → every field drafts itself, and fields the source did not
      support are named as unsupported rather than invented
- [ ] Org submits → post is `pending` and **invisible** to the individual account
- [ ] Admin approves in `/moderation` → it appears in the individual's feed
- [ ] Individual rates it useful, comments, replies, pins it
- [ ] **Ask This Insight**: ask something the post answers → streamed answer
- [ ] **Ask This Insight**: ask about something else entirely → it declines and
      says so. This is the test that proves the context lock, not the streaming
- [ ] **Does this apply to you?** → score, matching vs divergent conditions
- [ ] `/search` → **Describe your situation** → precedents with a stated reason
- [ ] Security: as the individual, request a `pending` post by id directly →
      404, indistinguishable from a post that does not exist
- [ ] A non-admin hitting `/dashboard` is redirected, not shown a broken page

---

## 7. Architecture, in one paragraph

The browser talks to Supabase directly for all ordinary reading and writing,
and **Row Level Security is the authorization boundary** — not application
code. The AI features route browser → Next.js API route (checks session and
role) → FastAPI agent service (holds the Gemini key and the service-role key).
The browser never reaches the agent service. Because that service bypasses RLS,
it re-derives visibility itself in `app/services/access.py` rather than
trusting the hop above it — deliberate duplication, since a check that exists
in only one hop is a check a refactor can quietly delete.
