-- Keep accountable authorship for moderation while allowing public anonymity.
alter table public.comments
  add column if not exists is_anonymous boolean not null default false;

alter table public.posts
  add column if not exists is_anonymous boolean not null default false;

comment on column public.comments.is_anonymous is
  'When true, public UI masks the author; author_id remains available to moderators.';

comment on column public.posts.is_anonymous is
  'When true, public UI masks the organization; org_id remains available to moderators.';
