-- Reader accounts are intentionally read-only in the community surface.
-- Verified organizations (and the legacy verified-reviewer role) may add
-- discussion context, usefulness feedback, votes, and pins.

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.profiles access_profile
    where access_profile.id = auth.uid()
      and access_profile.role in ('org', 'reviewer')
  )
  and exists (
    select 1 from public.posts p where p.id = post_id
    and (p.status = 'approved' or p.org_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments for update using (
  author_id = auth.uid()
  and exists (
    select 1 from public.profiles access_profile
    where access_profile.id = auth.uid()
      and access_profile.role in ('org', 'reviewer')
  )
);

drop policy if exists votes_upsert_own on public.comment_votes;
create policy votes_upsert_own on public.comment_votes for insert with check (
  user_id = auth.uid() and exists (
    select 1 from public.profiles access_profile where access_profile.id = auth.uid() and access_profile.role in ('org', 'reviewer')
  )
);
drop policy if exists votes_update_own on public.comment_votes;
create policy votes_update_own on public.comment_votes for update using (
  user_id = auth.uid() and exists (
    select 1 from public.profiles access_profile where access_profile.id = auth.uid() and access_profile.role in ('org', 'reviewer')
  )
);
drop policy if exists votes_delete_own on public.comment_votes;
create policy votes_delete_own on public.comment_votes for delete using (
  user_id = auth.uid() and exists (
    select 1 from public.profiles access_profile where access_profile.id = auth.uid() and access_profile.role in ('org', 'reviewer')
  )
);

drop policy if exists feedback_upsert_own on public.post_feedback;
create policy feedback_upsert_own on public.post_feedback for insert with check (
  user_id = auth.uid() and exists (
    select 1 from public.profiles access_profile where access_profile.id = auth.uid() and access_profile.role in ('org', 'reviewer')
  )
);
drop policy if exists feedback_update_own on public.post_feedback;
create policy feedback_update_own on public.post_feedback for update using (
  user_id = auth.uid() and exists (
    select 1 from public.profiles access_profile where access_profile.id = auth.uid() and access_profile.role in ('org', 'reviewer')
  )
);
drop policy if exists feedback_delete_own on public.post_feedback;
create policy feedback_delete_own on public.post_feedback for delete using (
  user_id = auth.uid() and exists (
    select 1 from public.profiles access_profile where access_profile.id = auth.uid() and access_profile.role in ('org', 'reviewer')
  )
);

drop policy if exists pins_all_own on public.pins;
create policy pins_all_own on public.pins for all using (
  user_id = auth.uid() and exists (
    select 1 from public.profiles access_profile where access_profile.id = auth.uid() and access_profile.role in ('org', 'reviewer')
  )
) with check (
  user_id = auth.uid() and exists (
    select 1 from public.profiles access_profile where access_profile.id = auth.uid() and access_profile.role in ('org', 'reviewer')
  )
);
