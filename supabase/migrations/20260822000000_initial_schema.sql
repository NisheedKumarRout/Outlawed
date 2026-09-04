-- ============================================================
-- OUTLAWED OTR — Supabase Postgres Schema (consolidated, single file)
-- Run this once, top to bottom, in the Supabase SQL editor.
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ============================================================
-- ENUMS
-- ============================================================
create type user_role as enum ('individual', 'org', 'reviewer', 'admin');
create type verification_status as enum ('pending', 'verified', 'rejected');
create type verification_type as enum ('organization', 'peer_reviewer');
create type post_status as enum ('draft', 'pending', 'approved', 'rejected', 'changes_requested');
create type post_visibility as enum ('public', 'registered', 'verified_org', 'restricted');
create type feedback_value as enum ('useful', 'somewhat_useful', 'not_useful');
create type target_kind as enum ('post', 'comment');
create type report_status as enum ('open', 'resolved', 'dismissed');
create type submission_source as enum ('session_notes', 'transcript', 'slide_deck', 'other');
create type redaction_status as enum ('processing', 'needs_manual_review', 'cleared', 'failed');

-- ============================================================
-- PROFILES — extends auth.users, one row per account regardless of role
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'individual',
  display_name text not null,
  avatar_url text,
  bio text,
  reviewer_status verification_status,      -- only meaningful when role = 'reviewer'
  created_at timestamptz not null default now()
);

-- Auto-create a profile row the moment someone signs up via Supabase Auth.
-- Without this, every foreign key in every other table breaks on first signup.
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email), 'individual');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- ORGANIZATIONS — public-facing org profile, 1:1 with profiles.id
-- ============================================================
create table organizations (
  id uuid primary key references profiles(id) on delete cascade,
  org_name text not null,
  description text,
  website text,
  sectors text[] not null default '{}',
  verified boolean not null default false,
  verified_at timestamptz,
  published_insight_count int not null default 0,
  useful_percentage numeric(5,2),
  created_at timestamptz not null default now()
);

-- ============================================================
-- VERIFICATION REQUESTS — org partnership applications + reviewer credentialing
-- ============================================================
create table verification_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  request_type verification_type not null,
  payload jsonb not null,                   -- org docs / reviewer CV+credentials, etc.
  status verification_status not null default 'pending',
  admin_notes text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- POSTS — the structured OTR insight, the core content unit
-- ============================================================
create table posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,

  title text not null,
  problem text not null,
  context text not null,
  approach text not null,
  evidence_outcome text not null,
  what_worked text,
  what_failed text,
  why_worked_or_failed text,
  conditions text,
  cautions text,
  would_do_differently text,
  key_takeaway text not null,

  sector text[] not null default '{}',
  target_group text[] not null default '{}',
  geography text,
  tags text[] not null default '{}',

  tldr text,                                -- AI-generated actionable summary
  visibility post_visibility not null default 'registered',
  status post_status not null default 'pending',

  -- 1536 dims matches OpenAI text-embedding-3-small. If you use a different
  -- embedding model, change this dimension before running this file.
  embedding vector(1536),

  view_count int not null default 0,
  admin_notes text,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index posts_embedding_idx on posts using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index posts_tags_idx on posts using gin (tags);
create index posts_sector_idx on posts using gin (sector);
create index posts_target_group_idx on posts using gin (target_group);
create index posts_status_idx on posts (status);

-- Editing an already-approved post sends it back to the moderation queue.
create or replace function reset_status_on_org_edit() returns trigger as $$
begin
  if old.status = 'approved' and new.status = 'approved' then
    new.status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_posts_edit
before update on posts
for each row execute function reset_status_on_org_edit();

-- ============================================================
-- POST REVISIONS — audit trail every time a post is edited
-- ============================================================
create table post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  editor_id uuid not null references profiles(id),
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- COMMENTS — nested via parent_comment_id
-- ============================================================
create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  parent_comment_id uuid references comments(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  is_deleted boolean not null default false,
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_post_idx on comments (post_id);
create index comments_parent_idx on comments (parent_comment_id);

-- ============================================================
-- COMMENT VOTES
-- ============================================================
create table comment_votes (
  comment_id uuid not null references comments(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- ============================================================
-- PEER REVIEWS — structured expert critique, distinct from comments
-- ============================================================
create table peer_reviews (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  reviewer_id uuid not null references profiles(id) on delete cascade,
  strength text,
  concern text,
  missing_context text,
  risk text,
  recommendation text,
  created_at timestamptz not null default now()
);
create index peer_reviews_post_idx on peer_reviews (post_id);

-- ============================================================
-- POST FEEDBACK — useful / somewhat useful / not useful (not a like button)
-- ============================================================
create table post_feedback (
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  value feedback_value not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ============================================================
-- PINS — personal saved insights
-- ============================================================
create table pins (
  user_id uuid not null references profiles(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- ============================================================
-- SEARCH LOGS — powers personalized search suggestions + trending queries
-- ============================================================
create table search_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  query text not null,
  filters jsonb,
  created_at timestamptz not null default now()
);
create index search_logs_user_idx on search_logs (user_id);

-- ============================================================
-- REPORTS — moderation reports on posts or comments
-- ============================================================
create table reports (
  id uuid primary key default gen_random_uuid(),
  target_kind target_kind not null,
  target_id uuid not null,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason text not null,
  description text,
  status report_status not null default 'open',
  resolved_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- RAW SUBMISSIONS — ingestion pipeline for raw session notes/transcripts/slides
-- ============================================================
create table raw_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  source_type submission_source not null,
  original_filename text,

  -- service-role only. Never selected by any client-facing query or view.
  storage_path text not null,
  extracted_text text,

  -- client-facing. This is what orgs and admins actually work with.
  redacted_text text,
  redaction_report jsonb,
  redaction_status redaction_status not null default 'processing',

  linked_post_id uuid references posts(id),
  created_at timestamptz not null default now()
);

-- Client-facing view: excludes storage_path and extracted_text entirely.
create view raw_submissions_review
  with (security_invoker = true) as
select
  id, org_id, source_type, original_filename,
  redacted_text, redaction_report, redaction_status,
  linked_post_id, created_at
from raw_submissions;

-- Private storage bucket for raw uploads.
insert into storage.buckets (id, name, public)
values ('raw-submissions', 'raw-submissions', false)
on conflict (id) do nothing;

-- ============================================================
-- RAG CHAT LOGS — optional, for the "Ask This Insight" feature
-- ============================================================
create table rag_chat_logs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  question text not null,
  answer text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- KNOWLEDGE GAP VIEW — admin dashboard: which sectors are under-covered
-- ============================================================
create view knowledge_gap_summary as
select unnest(sector) as sector, count(*) as insight_count
from posts
where status = 'approved'
group by unnest(sector)
order by insight_count asc;

-- ============================================================
-- SIMILARITY SEARCH RPC — callable from Supabase client or the agent service
-- ============================================================
create or replace function match_posts(
  query_embedding vector(1536),
  match_count int default 5,
  filter_sector text default null
)
returns table (id uuid, title text, similarity float)
language sql stable as $$
  select id, title, 1 - (embedding <=> query_embedding) as similarity
  from posts
  where status = 'approved'
    and (filter_sector is null or filter_sector = any(sector))
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- HELPER FUNCTIONS (security definer — avoids RLS self-recursion on profiles)
-- ============================================================
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function is_verified_org(check_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organizations where id = check_id and verified = true);
$$;

create or replace function is_verified_reviewer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'reviewer' and reviewer_status = 'verified'
  );
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table organizations enable row level security;
alter table verification_requests enable row level security;
alter table posts enable row level security;
alter table post_revisions enable row level security;
alter table comments enable row level security;
alter table comment_votes enable row level security;
alter table peer_reviews enable row level security;
alter table post_feedback enable row level security;
alter table pins enable row level security;
alter table search_logs enable row level security;
alter table reports enable row level security;
alter table raw_submissions enable row level security;
alter table rag_chat_logs enable row level security;

-- ---------- profiles ----------
create policy profiles_select_self on profiles for select using (id = auth.uid());
create policy profiles_select_org_public on profiles for select using (role = 'org');
create policy profiles_select_admin on profiles for select using (is_admin());
create policy profiles_update_self on profiles for update using (id = auth.uid());
create policy profiles_admin_all on profiles for all using (is_admin()) with check (is_admin());

-- ---------- organizations ----------
create policy organizations_select_public on organizations
  for select using (verified = true or id = auth.uid() or is_admin());
create policy organizations_update_self on organizations for update using (id = auth.uid());
create policy organizations_admin_all on organizations for all using (is_admin()) with check (is_admin());

-- ---------- verification_requests ----------
create policy verification_insert_self on verification_requests
  for insert with check (profile_id = auth.uid());
create policy verification_select_self on verification_requests
  for select using (profile_id = auth.uid() or is_admin());
create policy verification_admin_update on verification_requests
  for update using (is_admin()) with check (is_admin());

-- ---------- posts ----------
create policy posts_select_approved on posts for select using (
  status = 'approved' and (
    visibility = 'public'
    or (visibility in ('registered', 'verified_org') and auth.uid() is not null)
  )
);
create policy posts_select_own_org on posts for select using (org_id = auth.uid());
create policy posts_select_admin on posts for select using (is_admin());
create policy posts_insert_org on posts
  for insert with check (org_id = auth.uid() and is_verified_org(auth.uid()));
create policy posts_update_own_org on posts for update using (org_id = auth.uid());
create policy posts_admin_all on posts for all using (is_admin()) with check (is_admin());

-- ---------- post_revisions ----------
create policy revisions_select on post_revisions for select using (
  exists (select 1 from posts p where p.id = post_id and (p.org_id = auth.uid() or is_admin()))
);
create policy revisions_insert on post_revisions for insert with check (editor_id = auth.uid());

-- ---------- comments ----------
create policy comments_select on comments for select using (
  exists (
    select 1 from posts p where p.id = post_id
    and (p.status = 'approved' or p.org_id = auth.uid() or is_admin())
  )
);
create policy comments_insert on comments for insert with check (author_id = auth.uid());
create policy comments_update_own on comments for update using (author_id = auth.uid());
create policy comments_admin_all on comments for all using (is_admin()) with check (is_admin());

-- ---------- comment_votes ----------
create policy votes_select on comment_votes for select using (true);
create policy votes_upsert_own on comment_votes for insert with check (user_id = auth.uid());
create policy votes_update_own on comment_votes for update using (user_id = auth.uid());
create policy votes_delete_own on comment_votes for delete using (user_id = auth.uid());

-- ---------- peer_reviews ----------
create policy reviews_select on peer_reviews for select using (
  exists (select 1 from posts p where p.id = post_id and (p.status = 'approved' or is_admin()))
);
create policy reviews_insert on peer_reviews
  for insert with check (reviewer_id = auth.uid() and is_verified_reviewer());
create policy reviews_update_own on peer_reviews for update using (reviewer_id = auth.uid());
create policy reviews_admin_all on peer_reviews for all using (is_admin()) with check (is_admin());

-- ---------- post_feedback ----------
create policy feedback_select on post_feedback for select using (true);
create policy feedback_upsert_own on post_feedback for insert with check (user_id = auth.uid());
create policy feedback_update_own on post_feedback for update using (user_id = auth.uid());

-- ---------- pins ----------
create policy pins_all_own on pins for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- search_logs ----------
create policy search_logs_insert on search_logs
  for insert with check (user_id = auth.uid() or user_id is null);
create policy search_logs_select_own on search_logs
  for select using (user_id = auth.uid() or is_admin());

-- ---------- reports ----------
create policy reports_insert on reports for insert with check (reporter_id = auth.uid());
create policy reports_select_own on reports for select using (reporter_id = auth.uid() or is_admin());
create policy reports_admin_update on reports for update using (is_admin()) with check (is_admin());

-- ---------- raw_submissions ----------
create policy raw_submissions_select_own on raw_submissions
  for select using (org_id = auth.uid() or is_admin());
create policy raw_submissions_insert_own on raw_submissions
  for insert with check (org_id = auth.uid());
create policy raw_submissions_admin_update on raw_submissions
  for update using (is_admin()) with check (is_admin());

-- ---------- rag_chat_logs ----------
create policy rag_logs_insert on rag_chat_logs
  for insert with check (user_id = auth.uid() or user_id is null);
create policy rag_logs_select on rag_chat_logs
  for select using (user_id = auth.uid() or is_admin());

-- ============================================================
-- STORAGE POLICIES — raw-submissions bucket
-- Upload convention: paths are prefixed with the uploading org's id, e.g.
-- `{org_id}/2026-08-22-plv-notes.docx` — the policies below check that prefix.
-- ============================================================
create policy "raw_submissions_owner_upload"
on storage.objects for insert
with check (
  bucket_id = 'raw-submissions'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "raw_submissions_owner_read"
on storage.objects for select
using (
  bucket_id = 'raw-submissions'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or is_admin()
  )
);
