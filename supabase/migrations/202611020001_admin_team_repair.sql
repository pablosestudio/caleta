-- Repair deployments where the original one-admin index remained in place or
-- the team migration did not add the role column. Safe to apply repeatedly.
alter table public.caleta_admins
  add column if not exists role text not null default 'admin';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'caleta_admins_role_check'
      and conrelid = 'public.caleta_admins'::regclass
  ) then
    alter table public.caleta_admins
      add constraint caleta_admins_role_check check (role in ('owner','admin'));
  end if;
end
$$;

drop index if exists public.caleta_only_one_admin;

update public.caleta_admins
set role = 'owner'
where user_id = (
  select user_id
  from public.caleta_admins
  order by created_at asc
  limit 1
)
and not exists (
  select 1 from public.caleta_admins where role = 'owner'
);

comment on column public.caleta_admins.role is 'Team role: owner can manage administrator accounts; admins can maintain Caleta content.';
