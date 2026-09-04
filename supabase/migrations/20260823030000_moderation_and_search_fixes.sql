-- ============================================================
-- Patches a database created from the pre-fix schema.
-- A database created from the current supabase/schema.sql already has all of
-- this; running it there is harmless (every statement is idempotent).
--
-- Fixes, in order:
--   1. Any UPDATE to an approved post silently unpublished it.
--   2. View counts had no write path that did not trip that trigger.
--   3. Similar Cases hard-failed without a third-party embedding key.
--   4. post_feedback exposed every user's individual rating to every user.
--   5. Orgs could edit their own redaction verdict on a raw submission.
--   6. Anyone could attach a comment to a post they cannot see.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Shared predicate for "callers moderation guards must not fight".
-- ------------------------------------------------------------
create or replace function public.is_privileged_actor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') = 'service_role' or public.is_admin();
$$;

-- ------------------------------------------------------------
-- 1. The moderation trigger fired on EVERY update where status stayed
--    'approved' — so an admin editing admin_notes, a tldr write, or an
--    embedding backfill all unpublished the post. Now it is limited to
--    substantive content edits made by the owning organization.
-- ------------------------------------------------------------
create or replace function public.reset_status_on_org_edit() returns trigger as $$
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
    or new.visibility           is distinct from old.visibility
  ) then
    new.status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ------------------------------------------------------------
-- 2. View counts get an RPC instead of a direct UPDATE: no RLS policy grants
--    a reader write access to another org's post.
-- ------------------------------------------------------------
create or replace function public.increment_post_view(target_post_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update posts set view_count = view_count + 1
  where id = target_post_id and status = 'approved';
end;
$$;

-- ------------------------------------------------------------
-- 3. Lexical search, so Similar Cases works with no embedding provider.
-- ------------------------------------------------------------
create index if not exists posts_fts_idx on public.posts using gin (
  to_tsvector('english',
    coalesce(title, '') || ' ' || coalesce(problem, '') || ' ' ||
    coalesce(context, '') || ' ' || coalesce(approach, '') || ' ' ||
    coalesce(key_takeaway, ''))
);

create or replace function public.search_posts_lexical(
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

-- Skip rows with no embedding rather than ranking them by a null distance.
create or replace function public.match_posts(
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

-- ------------------------------------------------------------
-- 4. feedback_select was `using (true)` — every user could read who rated
--    what. Ratings become own-rows-only; aggregate counts move to a view
--    that runs as its owner, so counts stay public without exposing voters.
-- ------------------------------------------------------------
create or replace view public.post_feedback_summary as
select
  post_id,
  count(*) filter (where value = 'useful')          as useful_count,
  count(*) filter (where value = 'somewhat_useful') as somewhat_useful_count,
  count(*) filter (where value = 'not_useful')      as not_useful_count,
  count(*)                                          as total_count
from public.post_feedback
group by post_id;

grant select on public.post_feedback_summary to anon, authenticated;

drop policy if exists feedback_select on public.post_feedback;
drop policy if exists feedback_select_own on public.post_feedback;
create policy feedback_select_own on public.post_feedback
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists feedback_delete_own on public.post_feedback;
create policy feedback_delete_own on public.post_feedback
  for delete using (user_id = auth.uid());

-- ------------------------------------------------------------
-- 5. Orgs need UPDATE on raw_submissions to link a submission to a post, but
--    must never be able to write their own redaction verdict. RLS is
--    row-level, so the column lock is a trigger.
-- ------------------------------------------------------------
alter table public.raw_submissions add column if not exists redaction_error text;

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

drop trigger if exists trg_raw_submissions_redaction_guard on public.raw_submissions;
create trigger trg_raw_submissions_redaction_guard
before update on public.raw_submissions
for each row execute function public.prevent_redaction_self_clearance();

drop policy if exists raw_submissions_update_own on public.raw_submissions;
create policy raw_submissions_update_own on public.raw_submissions
  for update using (org_id = auth.uid()) with check (org_id = auth.uid());

-- Recreate instead of CREATE OR REPLACE because the pre-fix view does not
-- contain redaction_error. Inserting a column before linked_post_id would be
-- interpreted by Postgres as an attempted column rename (42P16).
drop view if exists public.raw_submissions_review;
create view public.raw_submissions_review
  with (security_invoker = true) as
select
  id, org_id, source_type, original_filename,
  redacted_text, redaction_report, redaction_status, redaction_error,
  linked_post_id, created_at
from public.raw_submissions;

grant select on public.raw_submissions_review to authenticated;

-- ------------------------------------------------------------
-- 6. comments_insert only checked authorship, not post visibility — anyone
--    could seed a discussion onto an unpublished insight by guessing its id.
-- ------------------------------------------------------------
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.posts p where p.id = post_id
    and (p.status = 'approved' or p.org_id = auth.uid() or public.is_admin())
  )
);

-- ------------------------------------------------------------
-- 7. Orgs create their own organizations row when applying for verification.
-- ------------------------------------------------------------
drop policy if exists organizations_insert_self on public.organizations;
create policy organizations_insert_self on public.organizations
  for insert with check (id = auth.uid());

grant select on public.knowledge_gap_summary to authenticated;
