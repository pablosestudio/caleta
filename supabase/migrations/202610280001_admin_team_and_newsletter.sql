-- Allow several invited administrators; never keep passwords in application data.
drop index if exists public.caleta_only_one_admin;
alter table public.caleta_admins
  add column if not exists role text not null default 'admin' check (role in ('owner','admin'));
with first_admin as (
  select user_id from public.caleta_admins order by created_at asc limit 1
)
update public.caleta_admins set role = 'owner'
where user_id = (select user_id from first_admin) and role <> 'owner';

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(trim(email)) and length(email) between 3 and 254),
  status text not null default 'pending' check (status in ('pending','active','unsubscribed')),
  consented_at timestamptz not null default now(),
  consent_version text not null,
  consent_source text not null default 'website',
  confirmed_at timestamptz,
  confirmation_token uuid unique default gen_random_uuid(),
  confirmation_expires_at timestamptz not null default (now() + interval '24 hours'),
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists newsletter_subscribers_status_created_idx
  on public.newsletter_subscribers(status, created_at desc);

create table if not exists public.newsletter_consent_events (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.newsletter_subscribers(id) on delete cascade,
  event_type text not null check (event_type in ('consent_requested','consent_confirmed','unsubscribed','consent_renewed')),
  consent_version text not null,
  source text not null default 'website',
  recorded_at timestamptz not null default now()
);
create index if not exists newsletter_consent_events_subscriber_idx
  on public.newsletter_consent_events(subscriber_id, recorded_at desc);

create table if not exists public.newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (length(trim(subject)) between 1 and 160),
  body text not null check (length(trim(body)) between 1 and 6000),
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'sending' check (status in ('sending','sent','partial','failed')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.newsletter_campaign_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.newsletter_campaigns(id) on delete cascade,
  subscriber_id uuid references public.newsletter_subscribers(id) on delete set null,
  status text not null check (status in ('sent','failed')),
  provider_message_id text,
  error_code text,
  sent_at timestamptz not null default now(),
  unique (campaign_id, subscriber_id)
);
create index if not exists newsletter_campaign_deliveries_campaign_idx
  on public.newsletter_campaign_deliveries(campaign_id, status);

create table if not exists public.newsletter_rate_limits (
  ip_hash text not null,
  window_start timestamptz not null,
  attempts integer not null default 0,
  primary key (ip_hash, window_start)
);

create or replace function public.consume_newsletter_signup(p_ip_hash text, p_window_start timestamptz, p_limit integer default 5)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  current_attempts integer;
begin
  delete from public.newsletter_rate_limits where window_start < now() - interval '2 days';
  insert into public.newsletter_rate_limits as rate_limit (ip_hash, window_start, attempts)
  values (p_ip_hash, p_window_start, 1)
  on conflict (ip_hash, window_start) do update
    set attempts = rate_limit.attempts + 1
  returning attempts into current_attempts;
  return current_attempts <= p_limit;
end;
$$;
revoke all on function public.consume_newsletter_signup(text,timestamptz,integer) from public, anon, authenticated;
grant execute on function public.consume_newsletter_signup(text,timestamptz,integer) to service_role;

-- Public unsubscribe is limited to possession of a random, per-subscriber token.
create or replace function public.unsubscribe_newsletter(p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  target_id uuid;
begin
  update public.newsletter_subscribers
    set status = 'unsubscribed', unsubscribed_at = now(), confirmation_token = null
    where unsubscribe_token = p_token and status = 'active'
    returning id into target_id;
  if target_id is null then return false; end if;
  insert into public.newsletter_consent_events(subscriber_id,event_type,consent_version,source)
    select id,'unsubscribed',consent_version,'email_unsubscribe'
    from public.newsletter_subscribers where id = target_id;
  return true;
end;
$$;
revoke all on function public.unsubscribe_newsletter(uuid) from public;
grant execute on function public.unsubscribe_newsletter(uuid) to anon, authenticated;

create or replace function public.set_newsletter_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists newsletter_subscribers_updated_at on public.newsletter_subscribers;
create trigger newsletter_subscribers_updated_at before update on public.newsletter_subscribers
  for each row execute function public.set_newsletter_updated_at();

alter table public.newsletter_subscribers enable row level security;
alter table public.newsletter_consent_events enable row level security;
alter table public.newsletter_campaigns enable row level security;
alter table public.newsletter_campaign_deliveries enable row level security;
alter table public.newsletter_rate_limits enable row level security;
revoke all on public.newsletter_subscribers, public.newsletter_consent_events,
  public.newsletter_campaigns, public.newsletter_campaign_deliveries, public.newsletter_rate_limits
  from public, anon, authenticated;
grant all on public.newsletter_subscribers, public.newsletter_consent_events,
  public.newsletter_campaigns, public.newsletter_campaign_deliveries, public.newsletter_rate_limits
  to service_role;

comment on table public.newsletter_subscribers is 'Only addresses with a separate, confirmed marketing opt-in. Access through the protected newsletter Edge Function only.';
comment on table public.newsletter_consent_events is 'Consent and withdrawal audit trail. Deletes with its subscriber on erasure.';
comment on table public.newsletter_campaign_deliveries is 'Delivery status only; no email snapshot is retained so deleting a subscriber removes their campaign linkage.';
