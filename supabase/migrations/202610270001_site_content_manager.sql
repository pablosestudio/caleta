-- Public site content is readable without an account, but only the registered
-- Caleta administrator may change it or upload public media.
create table if not exists public.site_content (
  id text primary key check (id = 'homepage'),
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;
revoke all on public.site_content from anon, authenticated;
grant select on public.site_content to anon, authenticated;
grant insert, update, delete on public.site_content to authenticated;

drop policy if exists "public reads homepage content" on public.site_content;
create policy "public reads homepage content" on public.site_content
  for select to anon, authenticated using (id = 'homepage');
drop policy if exists "admin manages homepage content" on public.site_content;
create policy "admin manages homepage content" on public.site_content
  for all to authenticated using (public.is_caleta_admin()) with check (public.is_caleta_admin());

drop trigger if exists site_content_updated_at on public.site_content;
create trigger site_content_updated_at before update on public.site_content
  for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('caleta-content', 'caleta-content', true, 5242880,
  array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/avif'];

drop policy if exists "Caleta admin uploads content media" on storage.objects;
create policy "Caleta admin uploads content media" on storage.objects
  for insert to authenticated with check (bucket_id = 'caleta-content' and public.is_caleta_admin());
drop policy if exists "Caleta admin updates content media" on storage.objects;
create policy "Caleta admin updates content media" on storage.objects
  for update to authenticated using (bucket_id = 'caleta-content' and public.is_caleta_admin())
  with check (bucket_id = 'caleta-content' and public.is_caleta_admin());
drop policy if exists "Caleta admin deletes content media" on storage.objects;
create policy "Caleta admin deletes content media" on storage.objects
  for delete to authenticated using (bucket_id = 'caleta-content' and public.is_caleta_admin());

comment on table public.site_content is 'Editable bilingual public copy and media URLs. Public read only; Caleta admin writes.';

create or replace function public.public_workshop_cards()
returns table (
  item_id uuid, title text, description text, starts_at timestamptz,
  ends_at timestamptz, remaining_places integer, age_range text,
  indicative_price numeric, image_url text
)
language sql stable security definer set search_path = '' as $$
  select w.id, w.title, w.description, w.starts_at, w.ends_at,
    greatest(0, w.capacity - coalesce((select sum(b.places) from public.booking_requests b
      where b.workshop_id = w.id and b.status in ('pending_review','awaiting_payment','confirmed')), 0)::integer),
    w.age_range, w.indicative_price, w.image_url
  from public.workshops w
  where w.status = 'published' and w.starts_at >= now()
    and w.capacity > coalesce((select sum(b.places) from public.booking_requests b
      where b.workshop_id = w.id and b.status in ('pending_review','awaiting_payment','confirmed')), 0)
  order by w.starts_at asc
  limit 12
$$;
revoke all on function public.public_workshop_cards() from public;
grant execute on function public.public_workshop_cards() to anon, authenticated;
