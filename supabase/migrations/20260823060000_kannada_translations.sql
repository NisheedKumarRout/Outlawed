-- Cached, source-versioned translations for published OTR insights.
-- The agent service writes with the service-role key; clients receive the
-- translation only through the visibility-checked Next.js/agent route.

create table if not exists public.post_translations (
  post_id uuid not null references public.posts(id) on delete cascade,
  language_code text not null check (language_code in ('kn')),
  source_updated_at timestamptz not null,
  content jsonb not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, language_code)
);

alter table public.post_translations enable row level security;

drop policy if exists post_translations_admin_select on public.post_translations;
create policy post_translations_admin_select on public.post_translations
  for select using (public.is_admin());

grant select on public.post_translations to authenticated;

