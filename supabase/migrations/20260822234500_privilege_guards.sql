-- Prevent signed-in users from escalating their own platform privileges.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.role is distinct from old.role
    or new.reviewer_status is distinct from old.reviewer_status
  )
  and coalesce(auth.role(), '') <> 'service_role'
  and not public.is_admin()
  then
    new.role := old.role;
    new.reviewer_status := old.reviewer_status;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_privilege_guard on public.profiles;
create trigger trg_profiles_privilege_guard
before update on public.profiles
for each row execute function public.prevent_profile_privilege_escalation();

-- Prevent organizations from changing their verification state or timestamp.
create or replace function public.prevent_org_self_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.verified is distinct from old.verified
    or new.verified_at is distinct from old.verified_at
  )
  and coalesce(auth.role(), '') <> 'service_role'
  and not public.is_admin()
  then
    new.verified := old.verified;
    new.verified_at := old.verified_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_organizations_verification_guard on public.organizations;
create trigger trg_organizations_verification_guard
before update on public.organizations
for each row execute function public.prevent_org_self_verification();
