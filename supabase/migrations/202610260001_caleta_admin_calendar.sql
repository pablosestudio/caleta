-- Caleta admin, calendar and booking foundations.
-- No public booking writes are granted by this migration. Public intake must
-- be added through a validated RPC/Edge Function after privacy and mail setup.
create extension if not exists btree_gist with schema extensions;

create table if not exists public.caleta_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_singleton boolean not null default true check (is_singleton),
  created_at timestamptz not null default now()
);
create unique index if not exists caleta_only_one_admin on public.caleta_admins (is_singleton);

create or replace function public.is_caleta_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.caleta_admins where user_id = (select auth.uid()))
$$;
revoke all on function public.is_caleta_admin() from public;
grant execute on function public.is_caleta_admin() to authenticated;

create table if not exists public.workshops (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity between 1 and 200),
  age_range text,
  indicative_price numeric(9,2) check (indicative_price is null or indicative_price >= 0),
  image_url text,
  status text not null default 'draft' check (status in ('draft','published','cancelled','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  block_type text not null default 'admin' check (block_type in ('admin','maintenance','private_event')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.calendar_availability (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Espacio disponible' check (length(trim(title)) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint no_overlapping_availability exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
);

create table if not exists public.indicative_rates (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(trim(label)) between 1 and 100),
  amount numeric(9,2) not null check (amount >= 0),
  valid_from date,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  booking_type text not null check (booking_type in ('space','workshop')),
  workshop_id uuid references public.workshops(id) on delete restrict,
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  places integer not null default 1 check (places between 1 and 200),
  customer_name text not null check (length(trim(customer_name)) between 1 and 160),
  customer_email text not null check (length(customer_email) <= 254),
  customer_phone text,
  notes text,
  status text not null default 'pending_review' check (status in ('pending_review','awaiting_payment','confirmed','rejected','expired','cancelled','attended')),
  deposit_amount numeric(9,2) check (deposit_amount is null or deposit_amount > 0),
  payment_deadline timestamptz,
  payment_provider_reference text unique,
  privacy_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((booking_type = 'workshop' and workshop_id is not null) or (booking_type = 'space' and workshop_id is null))
);
create index if not exists booking_requests_calendar_idx on public.booking_requests (starts_at, ends_at);
create index if not exists booking_requests_status_idx on public.booking_requests (status, created_at desc);

-- Prevent concurrent active space bookings for overlapping times. Pending
-- requests hold the requested period until Caleta accepts or rejects them.
alter table public.booking_requests drop constraint if exists no_overlapping_space_bookings;
alter table public.booking_requests add constraint no_overlapping_space_bookings
  exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
  where (booking_type = 'space' and status in ('pending_review','awaiting_payment','confirmed'));

-- Serialize seat counting by locking the workshop row before each active
-- workshop request is added or moved, preventing overselling capacity.
create or replace function public.enforce_workshop_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  available_capacity integer;
  already_held integer;
begin
  if new.booking_type <> 'workshop' or new.status not in ('pending_review','awaiting_payment','confirmed') then
    return new;
  end if;
  select capacity into available_capacity from public.workshops where id = new.workshop_id for update;
  if available_capacity is null then raise exception 'Workshop session not found'; end if;
  select coalesce(sum(places), 0) into already_held from public.booking_requests
    where workshop_id = new.workshop_id
      and status in ('pending_review','awaiting_payment','confirmed')
      and id is distinct from new.id;
  if already_held + new.places > available_capacity then raise exception 'Not enough workshop places'; end if;
  return new;
end;
$$;
drop trigger if exists booking_workshop_capacity on public.booking_requests;
create trigger booking_workshop_capacity before insert or update of workshop_id, places, status
  on public.booking_requests for each row execute function public.enforce_workshop_capacity();

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists workshops_updated_at on public.workshops;
create trigger workshops_updated_at before update on public.workshops for each row execute function public.set_updated_at();
drop trigger if exists bookings_updated_at on public.booking_requests;
create trigger bookings_updated_at before update on public.booking_requests for each row execute function public.set_updated_at();

-- Public calendar response contains availability only, never visitor names,
-- emails, phone numbers or internal reservation notes.
create or replace function public.public_calendar_options(p_from date, p_to date)
returns table (
  item_id uuid, item_type text, date date, period text, label text,
  starts_at timestamptz, ends_at timestamptz, remaining_places integer, available boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_from < (now() at time zone 'Europe/Madrid')::date then
    p_from := (now() at time zone 'Europe/Madrid')::date;
  end if;
  if p_to <= p_from or p_to - p_from > 62 then
    raise exception 'Calendar range must be between 1 and 62 days';
  end if;
  return query
  with space_options as (
    select a.id as item_id, 'space'::text as item_type,
      (a.starts_at at time zone 'Europe/Madrid')::date as date,
      case when (a.starts_at at time zone 'Europe/Madrid')::time = time '09:30' and (a.ends_at at time zone 'Europe/Madrid')::time = time '14:00' then 'morning'
        when (a.starts_at at time zone 'Europe/Madrid')::time = time '16:00' and (a.ends_at at time zone 'Europe/Madrid')::time = time '21:30' then 'afternoon' else 'full' end as period,
      a.title as label, a.starts_at, a.ends_at, null::integer as remaining_places
    from public.calendar_availability a
    where (a.starts_at at time zone 'Europe/Madrid')::date >= p_from
      and (a.starts_at at time zone 'Europe/Madrid')::date < p_to
  ), spaces_checked as (
    select s.*, not exists (
      select 1 from public.booking_requests b where b.booking_type = 'space'
        and b.status in ('pending_review','awaiting_payment','confirmed')
        and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(s.starts_at,s.ends_at,'[)')
    ) and not exists (
      select 1 from public.calendar_blocks c
        where tstzrange(c.starts_at,c.ends_at,'[)') && tstzrange(s.starts_at,s.ends_at,'[)')
    ) and not exists (
      select 1 from public.workshops w where w.status = 'published'
        and tstzrange(w.starts_at,w.ends_at,'[)') && tstzrange(s.starts_at,s.ends_at,'[)')
    ) as available from space_options s
  ), workshop_options as (
    select w.id as item_id, 'workshop'::text as item_type,
      (w.starts_at at time zone 'Europe/Madrid')::date as date, 'workshop'::text as period,
      w.title as label, w.starts_at, w.ends_at,
      greatest(0, w.capacity - coalesce((select sum(b.places) from public.booking_requests b
        where b.workshop_id = w.id and b.status in ('pending_review','awaiting_payment','confirmed')), 0)::integer) as remaining_places
    from public.workshops w where w.status = 'published'
      and (w.starts_at at time zone 'Europe/Madrid')::date >= p_from
      and (w.starts_at at time zone 'Europe/Madrid')::date < p_to
  )
  select s.item_id,s.item_type,s.date,s.period,s.label,s.starts_at,s.ends_at,s.remaining_places,s.available from spaces_checked s
  union all
  select w.item_id,w.item_type,w.date,w.period,w.label,w.starts_at,w.ends_at,w.remaining_places,w.remaining_places > 0 from workshop_options w
  order by 3, 4, 5;
end;
$$;
revoke all on function public.public_calendar_options(date,date) from public;
grant execute on function public.public_calendar_options(date,date) to anon, authenticated;

alter table public.caleta_admins enable row level security;
alter table public.workshops enable row level security;
alter table public.calendar_blocks enable row level security;
alter table public.calendar_availability enable row level security;
alter table public.indicative_rates enable row level security;
alter table public.booking_requests enable row level security;

drop policy if exists "admin manages admin identity" on public.caleta_admins;
create policy "admin manages admin identity" on public.caleta_admins for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "admin manages workshops" on public.workshops;
create policy "admin manages workshops" on public.workshops for all to authenticated using (public.is_caleta_admin()) with check (public.is_caleta_admin());
drop policy if exists "admin manages calendar blocks" on public.calendar_blocks;
create policy "admin manages calendar blocks" on public.calendar_blocks for all to authenticated using (public.is_caleta_admin()) with check (public.is_caleta_admin());
drop policy if exists "admin manages calendar availability" on public.calendar_availability;
create policy "admin manages calendar availability" on public.calendar_availability for all to authenticated using (public.is_caleta_admin()) with check (public.is_caleta_admin());
drop policy if exists "admin manages indicative rates" on public.indicative_rates;
create policy "admin manages indicative rates" on public.indicative_rates for all to authenticated using (public.is_caleta_admin()) with check (public.is_caleta_admin());
drop policy if exists "admin manages booking requests" on public.booking_requests;
create policy "admin manages booking requests" on public.booking_requests for all to authenticated using (public.is_caleta_admin()) with check (public.is_caleta_admin());

-- Tables can only be reached through authenticated requests that also pass RLS.
revoke all on public.caleta_admins, public.workshops, public.calendar_blocks, public.calendar_availability, public.indicative_rates, public.booking_requests from anon, authenticated;
grant select on public.caleta_admins to authenticated;
grant select, insert, update, delete on public.workshops, public.calendar_blocks, public.calendar_availability, public.indicative_rates, public.booking_requests to authenticated;

comment on table public.booking_requests is 'Contains customer personal data; admin-only access. Do not expose this table through public APIs.';
comment on table public.indicative_rates is 'Indicative prices only. Deposit amounts are chosen individually on each accepted request.';
