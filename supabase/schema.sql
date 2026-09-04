-- ============================================================
-- OUTLAWED OTR — Supabase Postgres Schema (consolidated, single file)
-- Run this once, top to bottom, in the Supabase SQL editor.
--
-- This file is the SINGLE source of truth for a fresh database. It already
-- folds in everything under supabase/migrations/, so do not run the migration
-- files on top of it — they exist only to patch a database created before
-- those fixes landed. `schema_additions.sql` is likewise superseded: its
-- raw_submissions / rag_chat_logs / storage content is already below.
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
-- HELPER FUNCTIONS (security definer — avoids RLS self-recursion on profiles)
-- Defined early: the triggers and policies further down both depend on them.
-- ============================================================
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function is_verified_reviewer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'reviewer' and reviewer_status = 'verified'
  );
$$;

-- Trusted callers that moderation guards must never fight: platform admins and
-- the service role (agent-service, seed scripts, backfills).
create or replace function is_privileged_actor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') = 'service_role' or public.is_admin();
$$;

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

create or replace function is_verified_org(check_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organizations where id = check_id and verified = true);
$$;

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
  is_anonymous boolean not null default false,

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
  image_url text,                           -- optional organization-supplied cover image
  visibility post_visibility not null default 'registered',
  status post_status not null default 'pending',

  -- 1536 dims matches OpenAI text-embedding-3-small, which is what both
  -- supabase/seed.py and agent-service/app/services/embeddings.py use. If you
  -- switch embedding models, change this dimension in all three places.
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

-- Lexical search index. This is what Similar Cases falls back to when no
-- embedding provider is configured, so it is not optional infrastructure.
create index posts_fts_idx on posts using gin (
  to_tsvector('english',
    coalesce(title, '') || ' ' || coalesce(problem, '') || ' ' ||
    coalesce(context, '') || ' ' || coalesce(approach, '') || ' ' ||
    coalesce(key_takeaway, ''))
);

-- ------------------------------------------------------------
-- An organization editing its own already-approved insight sends it back to
-- the moderation queue. Deliberately narrow:
--
--   * Admin and service-role writes are exempt. Moderation itself, tldr
--     generation, and embedding backfills all touch approved rows, and none
--     of them should unpublish anything.
--   * Only substantive content columns re-open moderation. A view_count bump
--     or an admin_notes edit is not new information for a reviewer to check.
--
-- Without both guards, any UPDATE touching an approved post silently
-- unpublishes it.
-- ------------------------------------------------------------
create or replace function reset_status_on_org_edit() returns trigger as $$
begin
  new.updated_at := now();

  if public.is_privileged_actor() then
    return new;
  end if;

  if old.status = 'approved' and new.status = 'approved' and (
       new.title                is distinct from old.title
    or new.problem              is distinct from old.problem
    or new.context              is distinct from old.context
    or new.approach             is distinct from old.approach
    or new.evidence_outcome     is distinct from old.evidence_outcome
    or new.what_worked          is distinct from old.what_worked
    or new.what_failed          is distinct from old.what_failed
    or new.why_worked_or_failed is distinct from old.why_worked_or_failed
    or new.conditions           is distinct from old.conditions
    or new.cautions             is distinct from old.cautions
    or new.would_do_differently is distinct from old.would_do_differently
    or new.key_takeaway         is distinct from old.key_takeaway
    or new.sector               is distinct from old.sector
    or new.target_group         is distinct from old.target_group
    or new.geography            is distinct from old.geography
    or new.tags                 is distinct from old.tags
    or new.image_url            is distinct from old.image_url
    or new.visibility           is distinct from old.visibility
  ) then
    new.status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_posts_edit
before update on posts
for each row execute function reset_status_on_org_edit();

-- View counts are incremented through this RPC rather than a direct UPDATE:
-- no RLS update policy grants a reader write access to someone else's post,
-- and a raw UPDATE would also have to fight the moderation trigger above.
create or replace function increment_post_view(target_post_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update posts set view_count = view_count + 1
  where id = target_post_id and status = 'approved';
end;
$$;

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
  is_anonymous boolean not null default false,
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

-- Aggregate counts are public; who rated what is not. Clients read this view
-- instead of selecting post_feedback rows directly.
create view post_feedback_summary as
select
  post_id,
  count(*) filter (where value = 'useful')          as useful_count,
  count(*) filter (where value = 'somewhat_useful') as somewhat_useful_count,
  count(*) filter (where value = 'not_useful')      as not_useful_count,
  count(*)                                          as total_count
from post_feedback
group by post_id;

-- ============================================================
-- POST TRANSLATIONS — generated once per source version and cached
-- ============================================================
create table post_translations (
  post_id uuid not null references posts(id) on delete cascade,
  language_code text not null check (language_code in ('kn')),
  source_updated_at timestamptz not null,
  content jsonb not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, language_code)
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
  redaction_error text,

  linked_post_id uuid references posts(id),
  created_at timestamptz not null default now()
);
create index raw_submissions_org_idx on raw_submissions (org_id);
create index raw_submissions_status_idx on raw_submissions (redaction_status);

-- Client-facing view: excludes storage_path and extracted_text entirely.
-- RLS is row-level, not column-level, so an org selecting its own
-- raw_submissions row would otherwise get back the unredacted text too.
-- security_invoker keeps the underlying table's RLS applied to the caller.
create view raw_submissions_review
  with (security_invoker = true) as
select
  id, org_id, source_type, original_filename,
  redacted_text, redaction_report, redaction_status, redaction_error,
  linked_post_id, created_at
from raw_submissions;

-- Private storage bucket for raw uploads.
insert into storage.buckets (id, name, public)
values ('raw-submissions', 'raw-submissions', false)
on conflict (id) do nothing;

-- ============================================================
-- RAG CHAT LOGS — "Ask This Insight" query log
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
-- SEARCH RPCs
-- ============================================================

-- Vector similarity. Used when an embedding provider is configured.
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
    and embedding is not null
    and (filter_sector is null or filter_sector = any(sector))
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Lexical fallback. Similar Cases degrades to this when no embedding provider
-- is configured, or when posts have no embedding yet, so the feature never
-- hard-fails on a missing third-party key.
create or replace function search_posts_lexical(
  query_text text,
  match_count int default 5,
  filter_sector text default null
)
returns table (id uuid, title text, similarity float)
language sql stable as $$
  select
    p.id,
    p.title,
    ts_rank(
      to_tsvector('english',
        coalesce(p.title, '') || ' ' || coalesce(p.problem, '') || ' ' ||
        coalesce(p.context, '') || ' ' || coalesce(p.approach, '') || ' ' ||
        coalesce(p.key_takeaway, '')),
      websearch_to_tsquery('english', query_text)
    )::float as similarity
  from posts p
  where p.status = 'approved'
    and (filter_sector is null or filter_sector = any(p.sector))
    and to_tsvector('english',
          coalesce(p.title, '') || ' ' || coalesce(p.problem, '') || ' ' ||
          coalesce(p.context, '') || ' ' || coalesce(p.approach, '') || ' ' ||
          coalesce(p.key_takeaway, ''))
        @@ websearch_to_tsquery('english', query_text)
  order by similarity desc
  limit match_count;
$$;

-- ============================================================
-- PRIVILEGE GUARDS
-- RLS decides which ROWS you may write. These triggers decide which COLUMNS
-- you may move within a row you already own, which RLS cannot express.
-- ============================================================

-- Nobody promotes themselves to admin or self-certifies as a peer reviewer.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (
    new.role is distinct from old.role
    or new.reviewer_status is distinct from old.reviewer_status
  ) and not public.is_privileged_actor()
  then
    new.role := old.role;
    new.reviewer_status := old.reviewer_status;
  end if;

  return new;
end;
$$;

create trigger trg_profiles_privilege_guard
before update on public.profiles
for each row execute function public.prevent_profile_privilege_escalation();

-- An organization never marks itself verified.
create or replace function public.prevent_org_self_verification()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (
    new.verified is distinct from old.verified
    or new.verified_at is distinct from old.verified_at
  ) and not public.is_privileged_actor()
  then
    new.verified := old.verified;
    new.verified_at := old.verified_at;
  end if;

  return new;
end;
$$;

create trigger trg_organizations_verification_guard
before update on public.organizations
for each row execute function public.prevent_org_self_verification();

-- An org may link a submission to a post, but never edit its own redaction
-- verdict. Only the service role (agent-service) and admins move these.
create or replace function public.prevent_redaction_self_clearance()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_privileged_actor() then
    new.redaction_status := old.redaction_status;
    new.redacted_text := old.redacted_text;
    new.redaction_report := old.redaction_report;
    new.redaction_error := old.redaction_error;
    new.storage_path := old.storage_path;
    new.extracted_text := old.extracted_text;
  end if;

  return new;
end;
$$;

create trigger trg_raw_submissions_redaction_guard
before update on public.raw_submissions
for each row execute function public.prevent_redaction_self_clearance();

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
alter table post_translations enable row level security;
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
create policy organizations_insert_self on organizations
  for insert with check (id = auth.uid());
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
-- Visibility tiers stay distinct: a signed-in individual is not a verified org.
create policy posts_select_approved on posts for select using (
  status = 'approved' and (
    visibility = 'public'
    or (visibility = 'registered' and auth.uid() is not null)
    or (visibility = 'verified_org' and is_verified_org(auth.uid()))
  )
);
create policy posts_select_own_org on posts for select using (org_id = auth.uid());
create policy posts_select_admin on posts for select using (is_admin());

-- Organizations may draft or submit for review, but never self-publish.
create policy posts_insert_org on posts
  for insert with check (
    org_id = auth.uid()
    and is_verified_org(auth.uid())
    and status in ('draft', 'pending')
  );

-- Organization edits can only land in organization-controlled workflow states.
-- reset_status_on_org_edit has already demoted an edited approved post to
-- 'pending' by the time this WITH CHECK is evaluated.
create policy posts_update_own_org on posts
  for update using (org_id = auth.uid())
  with check (
    org_id = auth.uid()
    and status in ('draft', 'pending', 'changes_requested')
  );
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
-- Commenting requires the post to actually be visible to you, not just a
-- valid post id. Without the EXISTS clause anyone could seed a discussion
-- onto an unpublished insight by guessing its id.
create policy comments_insert on comments for insert with check (
  author_id = auth.uid()
  and exists (
    select 1 from profiles access_profile
    where access_profile.id = auth.uid()
      and access_profile.role in ('org', 'reviewer')
  )
  and exists (
    select 1 from posts p where p.id = post_id
    and (p.status = 'approved' or p.org_id = auth.uid() or is_admin())
  )
);
create policy comments_update_own on comments for update using (
  author_id = auth.uid()
  and exists (
    select 1 from profiles access_profile
    where access_profile.id = auth.uid()
      and access_profile.role in ('org', 'reviewer')
  )
);
create policy comments_admin_all on comments for all using (is_admin()) with check (is_admin());

-- ---------- comment_votes ----------
create policy votes_select on comment_votes for select using (true);
create policy votes_upsert_own on comment_votes for insert with check (
  user_id = auth.uid() and exists (
    select 1 from profiles access_profile where access_profile.id = auth.uid() and access_profile.role in ('org', 'reviewer')
  )
);
create policy votes_update_own on comment_votes for update using (
  user_id = auth.uid() and exists (
    select 1 from profiles access_profile where access_profile.id = auth.uid() and access_profile.role in ('org', 'reviewer')
  )
);
create policy votes_delete_own on comment_votes for delete using (
  user_id = auth.uid() and exists (
    select 1 from profiles access_profile where access_profile.id = auth.uid() and access_profile.role in ('org', 'reviewer')
  )
);

-- ---------- peer_reviews ----------
create policy reviews_select on peer_reviews for select using (
  exists (select 1 from posts p where p.id = post_id and (p.status = 'approved' or is_admin()))
);
create policy reviews_insert on peer_reviews
  for insert with check (reviewer_id = auth.uid() and is_verified_reviewer());
create policy reviews_update_own on peer_reviews for update using (reviewer_id = auth.uid());
create policy reviews_admin_all on peer_reviews for all using (is_admin()) with check (is_admin());

-- ---------- post_feedback ----------
-- Own rows only. Aggregate counts come from post_feedback_summary, so nobody
-- needs to read another user's individual rating to render a post.
create policy feedback_select_own on post_feedback
  for select using (user_id = auth.uid() or is_admin());
create policy feedback_upsert_own on post_feedback for insert with check (
  user_id = auth.uid() and exists (
    select 1 from profiles access_profile where access_profile.id = auth.uid() and access_profile.role in ('org', 'reviewer')
  )
);
create policy feedback_update_own on post_feedback for update using (
  user_id = auth.uid() and exists (
    select 1 from profiles access_profile where access_profile.id = auth.uid() and access_profile.role in ('org', 'reviewer')
  )
);
create policy feedback_delete_own on post_feedback for delete using (
  user_id = auth.uid() and exists (
    select 1 from profiles access_profile where access_profile.id = auth.uid() and access_profile.role in ('org', 'reviewer')
  )
);

-- ---------- post_translations ----------
-- Translation reads go through the visibility-checked agent route. Admins may
-- inspect the cache directly; the service role bypasses RLS to maintain it.
create policy post_translations_admin_select on post_translations
  for select using (is_admin());

-- ---------- pins ----------
create policy pins_all_own on pins for all using (
  user_id = auth.uid() and exists (
    select 1 from profiles access_profile where access_profile.id = auth.uid() and access_profile.role in ('org', 'reviewer')
  )
) with check (
  user_id = auth.uid() and exists (
    select 1 from profiles access_profile where access_profile.id = auth.uid() and access_profile.role in ('org', 'reviewer')
  )
);

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
-- An org may link a cleared submission to a post it drafts. The
-- trg_raw_submissions_redaction_guard trigger above reverts any attempt to
-- edit redacted_text or redaction_status through this policy.
create policy raw_submissions_update_own on raw_submissions
  for update using (org_id = auth.uid()) with check (org_id = auth.uid());
create policy raw_submissions_admin_update on raw_submissions
  for update using (is_admin()) with check (is_admin());

-- ---------- rag_chat_logs ----------
create policy rag_logs_insert on rag_chat_logs
  for insert with check (user_id = auth.uid() or user_id is null);
create policy rag_logs_select on rag_chat_logs
  for select using (user_id = auth.uid() or is_admin());

-- ============================================================
-- VIEW GRANTS
-- Views are not covered by the table GRANTs Supabase applies automatically.
-- ============================================================
grant select on post_feedback_summary to anon, authenticated;
grant select on post_translations to authenticated;
grant select on raw_submissions_review to authenticated;
grant select on knowledge_gap_summary to authenticated;

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

-- Public post covers contain no raw case material. Uploads remain restricted
-- to a path prefixed by the signed-in organization id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-images',
  'post-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "post_images_public_read"
on storage.objects for select
using (bucket_id = 'post-images');

create policy "post_images_owner_upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "post_images_owner_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "post_images_owner_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
