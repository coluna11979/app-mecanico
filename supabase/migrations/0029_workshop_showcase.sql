-- Vitrine da oficina: informações opcionais para DIVULGAÇÃO (fase 1: coleta).
-- Nada é publicado sem consent_at (autorização de uso de informações e imagens).
-- Fase 2 (página pública) adiciona leitura anônima quando consent_at is not null.

create table if not exists public.workshop_showcase (
  workshop_id uuid primary key references public.workshops(id) on delete cascade,
  -- Serviços e especialidades
  services        text[] not null default '{}',
  vehicle_types   text[] not null default '{}',
  brands          text[] not null default '{}',
  -- Estrutura
  bays            integer check (bays is null or bays between 0 and 500),
  lifts           integer check (lifts is null or lifts between 0 and 500),
  equipment       text[] not null default '{}',
  amenities       text[] not null default '{}',
  -- Público
  customer_types  text[] not null default '{}',
  price_tier      text check (price_tier in ('economica', 'intermediaria', 'premium')),
  service_area    text,
  -- Funcionamento e contato
  hours           jsonb not null default '{}'::jsonb,
  whatsapp        text,
  instagram       text,
  google_url      text,
  website         text,
  founded_year    integer check (founded_year is null or founded_year between 1900 and 2100),
  payment_methods text[] not null default '{}',
  warranty_days   integer check (warranty_days is null or warranty_days between 0 and 3650),
  -- Diferenciais
  highlights      text,
  certifications  text,
  -- Autorização de uso para divulgação
  consent_at      timestamptz,
  consent_by      uuid references auth.users(id) on delete set null,
  -- Lembrete no Painel ("agora não")
  reminder_snoozed_until timestamptz,
  updated_at      timestamptz not null default now()
);

alter table public.workshop_showcase enable row level security;

drop policy if exists workshop_showcase_member on public.workshop_showcase;
create policy workshop_showcase_member on public.workshop_showcase
  for all using (public.is_workshop_member(workshop_id, auth.uid()) or public.is_admin(auth.uid()))
  with check (public.is_workshop_member(workshop_id, auth.uid()) or public.is_admin(auth.uid()));

create or replace function public.touch_workshop_showcase()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touch_workshop_showcase on public.workshop_showcase;
create trigger trg_touch_workshop_showcase before update on public.workshop_showcase
  for each row execute function public.touch_workshop_showcase();

-- Fotos
create table if not exists public.workshop_showcase_photos (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  kind        text not null check (kind in ('facade', 'reception', 'service_area', 'equipment', 'team', 'other')),
  path        text not null,
  caption     text,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists workshop_showcase_photos_ws_idx on public.workshop_showcase_photos(workshop_id);

alter table public.workshop_showcase_photos enable row level security;

drop policy if exists workshop_showcase_photos_member on public.workshop_showcase_photos;
create policy workshop_showcase_photos_member on public.workshop_showcase_photos
  for all using (public.is_workshop_member(workshop_id, auth.uid()) or public.is_admin(auth.uid()))
  with check (public.is_workshop_member(workshop_id, auth.uid()) or public.is_admin(auth.uid()));

-- Bucket público (as fotos existem para serem divulgadas); escrita só da própria oficina,
-- na pasta {workshop_id}/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workshop-showcase', 'workshop-showcase', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists workshop_showcase_insert on storage.objects;
create policy workshop_showcase_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'workshop-showcase'
    and public.is_workshop_member(((storage.foldername(name))[1])::uuid, auth.uid()));

drop policy if exists workshop_showcase_update on storage.objects;
create policy workshop_showcase_update on storage.objects for update to authenticated
  using (bucket_id = 'workshop-showcase'
    and public.is_workshop_member(((storage.foldername(name))[1])::uuid, auth.uid()));

drop policy if exists workshop_showcase_delete on storage.objects;
create policy workshop_showcase_delete on storage.objects for delete to authenticated
  using (bucket_id = 'workshop-showcase'
    and public.is_workshop_member(((storage.foldername(name))[1])::uuid, auth.uid()));
