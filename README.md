# OUTLAWED OTR

**A verified knowledge-to-action platform for legal-aid organisations.**

Not a forum. Not a searchable PDF archive. A system that turns one
organisation's hard-won field lessons into guidance another organisation can
find, trust, and act on — before they repeat the same mistake from scratch.

> **Setup, manual steps, and the demo checklist live in [SETUP.md](SETUP.md).**
> There is one pending database migration — start there.

## The Problem

OutLawed India and KSLSA have generated valuable field experience through their legal-aid programmes. Through OTR (On The Record), organisations review real programme data and identify important lessons.

However, these insights often become “words on a page” and remain inaccessible to other organisations facing similar challenges.

LegalCompass solves this problem by turning field experience into trusted, reusable guidance.

## The Core Idea

LegalCompass focuses on three things:

1. **Structured Knowledge** – Every insight captures the problem, context, approach, successes, failures, conditions, cautions, and key takeaways.
2. **Trust** – Organisations are verified and every submission is reviewed by an independent OutLawed India administrator before publication.
3. **Context-Aware Reuse** – Organisations can describe their own situation and discover relevant precedents instead of simply searching documents.

## User Roles

| Role | Can do |
|---|---|
| **Reader** | Search and read approved insights. No comments, pins, submissions, or moderation. |
| **Organisation / firm (verified)** | Use a separate login and workspace to submit insights, upload source material, discuss precedents, and track proposals. |
| **Admin (OutLawed India)** | Use a separately deployed operator website containing the central library, organisation verification, and approve/reject controls. |

Manual verification is mandatory everywhere it matters. Nothing an org submits
goes live without an admin decision.

## How It Works, End to End

Upload → Redact → Structure → Review → Admin Approval → Publish → Discover → Apply

1. Organisation uploads reports, notes, or transcripts.
2. AI detects and redacts sensitive information.
3. AI helps convert the material into a structured OTR Insight.
4. The organisation reviews and edits it.
5. Admin independently verifies and approves it.
6. Approved insights become available to readers.
7. Organisations can search, ask questions, and find similar cases.
8. The “Does this apply to you?” feature compares an insight with an organisation's real context.

## Technical Architecture

- **Frontend**: Next.js 16 (App Router), Tailwind. Ordinary reading and writing
  goes straight from the browser to Supabase, with every permission rule
  enforced as **Row Level Security, not application code**.
- **Data**: Supabase — Postgres, Auth, and `pgvector` in one service. RLS
  policies are the actual authorization boundary; the browser holding the
  publishable key is never the security model on its own.
- **AI layer**: a separate Python/FastAPI service, the only thing holding the
  Gemini API key and the Supabase service-role key. Every AI feature routes
  through a Next.js API route first, which checks the caller's session and role.
  The browser never talks to it directly.
- **Trust boundary discipline**: code holding elevated, RLS-bypassing
  credentials re-checks visibility itself rather than trusting that an earlier
  layer already did — see `agent-service/app/services/access.py`, which the RAG
  and applicability routes both go through.

### Repository layout

```
agent-service/     FastAPI. Gemini + service-role keys live here, nowhere else.
  app/routers/       6 routes: structure, ingest/redact, similar-cases,
                     applicability, discussion-summary, rag-query (streaming)
  app/services/      prompts, redaction chunking, retrieval, context assembly
  app/services/access.py   independent visibility enforcement
  scripts/           one-off embedding backfill
web/               Next.js app + API routes that proxy to agent-service
supabase/          schema.sql (fresh DBs), migrations/ (existing DBs), seed.py
Outlawed_Datasets/ the real OTR report and PLV survey the seed draws from
```

## Grounded in Real Data, Not a Demo Fiction

Every seeded organisation is a real, named institution already present in
OutLawed India's own programme data — KSLSA and three real District Legal
Services Authorities (Haveri, Chikkaballapur, Kolar), each contributing
genuinely distinct findings from their own district's PLV programme. OutLawed
India itself is modelled as the platform admin, matching the facilitator role it
describes for itself in its own OTR report. Nothing in the seed data is a
fabricated organisation or an invented insight.

## Quick Start

```bash
# 1. Apply the pending migration — see SETUP.md step 1
# 2. Dependencies
.venv/Scripts/python.exe -m pip install -r agent-service/requirements.txt
cd web && npm install

# 3. Three terminals
cd agent-service && ../.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
cd web && npm run dev
cd web && npm run dev:admin
```

Public/organisation website: `http://localhost:3000`

OutLawed admin website: `http://localhost:3001`

For hosting, deploy the `web` directory twice against the same Supabase
project. Set `PORTAL_MODE=public` on the public deployment and
`PORTAL_MODE=admin` on the operator deployment; set `PUBLIC_APP_URL` and
`ADMIN_PORTAL_URL` to their real domains. The route boundary prevents either
deployment from serving the other portal.

`http://127.0.0.1:8000/health` reports which credentials are wired up without
printing any of them — check it first if an AI feature seems to do nothing.
