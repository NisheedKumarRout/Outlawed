-- Optional, organization-owned cover photos for OTR insights.

alter table public.posts
  add column if not exists image_url text;

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

drop policy if exists "post_images_public_read" on storage.objects;
create policy "post_images_public_read"
on storage.objects for select
using (bucket_id = 'post-images');

drop policy if exists "post_images_owner_upload" on storage.objects;
create policy "post_images_owner_upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "post_images_owner_update" on storage.objects;
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

drop policy if exists "post_images_owner_delete" on storage.objects;
create policy "post_images_owner_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

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

update public.posts
set image_url = case title
  when 'Cybercrime Awareness Is Missing From Standard PLV Training'
    then '/case-images/cybercrime-training.webp'
  when 'Long-Tenured PLVs Want Validation, New PLVs Want Courage'
    then '/case-images/plv-tenure-workshop.webp'
  when 'Interactive, Local-Language Training Reduced Fear of Police Non-Response'
    then '/case-images/local-language-training.webp'
  when 'A Shared Repository Was the Ecosystem''s Own Idea'
    then '/case-images/peer-review-session.webp'
  when 'Confusion Regarding Funds: What Districts Don''t Track'
    then '/case-images/district-funding-review.webp'
  when 'Bridging the Formal and the Informal'
    then '/case-images/formal-informal-bridge.webp'
  when 'Deployment Without a System: Why PLV Impact Depends on One Person'
    then '/case-images/plv-field-deployment.webp'
  when 'The Identity Crisis of PLVs'
    then '/case-images/plv-identity-workers.webp'
  else image_url
end
where image_url is null;
