-- Keep visibility tiers distinct: a signed-in individual is not a verified org.
drop policy if exists posts_select_approved on public.posts;
create policy posts_select_approved on public.posts
  for select using (
    status = 'approved'
    and (
      visibility = 'public'
      or (visibility = 'registered' and auth.uid() is not null)
      or (visibility = 'verified_org' and public.is_verified_org(auth.uid()))
    )
  );

-- Organizations may create drafts or submit for review, but never self-publish.
drop policy if exists posts_insert_org on public.posts;
create policy posts_insert_org on public.posts
  for insert with check (
    org_id = auth.uid()
    and public.is_verified_org(auth.uid())
    and status in ('draft', 'pending')
  );

-- Organization edits can only remain in organization-controlled workflow states.
-- The existing reset_status_on_org_edit trigger changes edits to approved posts
-- back to pending before this WITH CHECK expression is evaluated.
drop policy if exists posts_update_own_org on public.posts;
create policy posts_update_own_org on public.posts
  for update using (org_id = auth.uid())
  with check (
    org_id = auth.uid()
    and status in ('draft', 'pending', 'changes_requested')
  );
