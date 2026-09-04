# OUTLAWED OTR — Deployment & Demo Evaluation Guide

This guide documents the deployed architecture, live service endpoints, demonstration accounts, and required environment configurations for the **OUTLAWED OTR** legal-aid knowledge-to-action platform.

---

## 1. Live Deployment Architecture

The system is deployed in a modern, decoupled production architecture across three specialized cloud platforms:

```
┌─────────────────────────────────────────────────────────┐
│                    VERCEL (Frontend)                    │
│   Next.js 16 App Router (web/)                         │
│   - UI, Authentication session handling                 │
│   - Direct read/write to Supabase via Row Level Security│
│   - Proxies AI tasks to Render via server-side routes   │
└──────────────┬───────────────────────────┬──────────────┘
               │                           │
               │ (Private HTTPS Calls)     │ (Direct Client & Server RLS)
               ▼                           ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│       RENDER (AI Backend)    │   │     SUPABASE (Data & Auth)   │
│   Python FastAPI (agent-service) │   │   PostgreSQL + Auth + Storage│
│   - Document extraction (PDF,│   │   - Profiles & Organizations │
│     DOCX, PPTX)              │   │   - Posts, Comments, Feedback│
│   - Gemini AI (Redaction,    │   │   - Vector/Full-text search  │
│     Structuring, RAG Chat,   │   │   - Buckets: raw-submissions,│
│     Applicability, Kannada)  │   │     post-images              │
└──────────────┬───────────────┘   └──────────────▲───────────────┘
               │                                  │
               └──── Service Role Key (Bypasses RLS) ─┘
```

### Live Service Details:

| Component | Platform | Role & Functionality | Live Endpoint |
|---|---|---|---|
| **Web Frontend** | **Vercel** | Next.js 16 (App Router) public & operator portals | [Your Vercel Deployment URL] |
| **AI Microservice** | **Render** | Python FastAPI handling Gemini LLM operations, PII redaction, document extraction, RAG querying | [outlawed-agent-service.onrender.com](https://outlawed-agent-service.onrender.com) |
| **Database & Auth** | **Supabase** | PostgreSQL with `pgvector`, Row Level Security, Auth, and Storage | `https://hvwoxmozdvztbwmqynhn.supabase.co` |
| **Backend Health** | **Render** | Reports operational status and verified AI capabilities | [/health Endpoint](https://outlawed-agent-service.onrender.com/health) |

---

## 2. Pre-Configured Demo Accounts for Testing

The database has been seeded with real legal-aid institutions from Karnataka (KSLSA and District Legal Services Authorities) alongside 8 real-world field case studies.

> **Default Password for ALL seeded accounts:**
> `ChangeMe123!seed`

### Account Access Matrix

| Role | Email | Organization Name | Key Features to Test |
|---|---|---|---|
| **Platform Admin** | `admin.outlawedindia@seed.outlawedotr.local` | **OutLawed India** | • Access `/moderation` to approve or reject pending insights<br>• Access `/verifications` to verify applicant organizations<br>• Access `/ingestion-queue` to review and clear raw uploads |
| **Verified Org 1** | `kslsa@seed.outlawedotr.local` | **Karnataka State Legal Services Authority (KSLSA)** | • Upload raw case notes at `/submissions/new`<br>• Automated PII redaction reports<br>• Draft structured insights with AI at `/posts/new` |
| **Verified Org 2** | `haveri.dlsa@seed.outlawedotr.local` | **Haveri DLSA** | • Submit district-level PLV insights<br>• Participate in precedent discussions<br>• View organization profile and contributions |
| **Verified Org 3** | `chikkaballapur.dlsa@seed.outlawedotr.local` | **Chikkaballapur DLSA** | • Draft and view district-specific legal-aid precedents |
| **Verified Org 4** | `kolar.dlsa@seed.outlawedotr.local` | **Kolar DLSA** | • Contributing partner account for legal-aid review |
| **Reader / Public** | `reader@seed.outlawedotr.local` | *Individual Account* | • Explore and search approved insights<br>• Streamed "Ask This Insight" (RAG chat with context lock)<br>• "Does this apply to you?" contextual fit score<br>• Rate insights as useful, bookmark, or pin |

*(Note: You can also register a brand-new account directly via the "Sign Up" page on the web app. New signups automatically receive a Reader profile).*

---

## 3. Recommended End-to-End Demo Walkthrough

1. **Reader Experience:**
   - Log in as `reader@seed.outlawedotr.local`.
   - Browse the insight feed or search `/search` using natural language scenarios.
   - Open any approved case (e.g. *Interactive, Local-Language Training*).
   - Use **Ask This Insight** to ask questions grounded exclusively in the post.
   - Test **Does this apply to you?** to evaluate your organization's context against the case.

2. **Organization Ingestion & Structuring Flow:**
   - In a private/incognito window, log in as `kslsa@seed.outlawedotr.local`.
   - Navigate to `/submissions/new` and upload raw field notes.
   - Observe automated PII redaction categorization.
   - Navigate to `/posts/new`, paste notes to auto-draft structured fields (problem, approach, what failed, cautions, key takeaways).
   - Submit for review (post enters `pending` state, hidden from general readers).

3. **Admin Moderation Flow:**
   - Log in as `admin.outlawedindia@seed.outlawedotr.local`.
   - Review pending insights at `/moderation` and pending organizations at `/verifications`.
   - Approve the submission — it immediately appears in the public feed for all readers.

---

## 4. Environment Configuration Template

Below is the configuration schema required to deploy this repository:

### Render (`agent-service` — Python FastAPI)
```env
APP_ENV=production
SUPABASE_URL=https://<your-supabase-project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-secret>
AI_PROVIDER=gemini
GEMINI_API_KEY=<your-google-ai-studio-gemini-key>
INTERNAL_API_KEY=<shared-64-character-secret-between-web-and-agent>
```

### Vercel (`web` — Next.js 16)
```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-supabase-project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-public-key>
AGENT_SERVICE_URL=https://<your-render-backend-url>.onrender.com
INTERNAL_API_KEY=<shared-64-character-secret-matching-agent-service>
PORTAL_MODE=public
PUBLIC_APP_URL=https://<your-vercel-app>.vercel.app
ADMIN_PORTAL_URL=https://<your-vercel-app>.vercel.app
```
