-- Check-up do veículo (Fase 1 — ferramenta independente)
-- O mecânico faz uma inspeção guiada (ok/atenção/urgente + fotos), o app calcula
-- a nota de saúde e gera um relatório público por link (WhatsApp).
-- Não depende de OS/job: veículo e cliente ficam gravados no próprio check-up.
-- O vínculo com job/oficina/OS entra numa fase seguinte.

create table if not exists public.vehicle_checkups (
  id             uuid primary key default gen_random_uuid(),
  created_by     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  plate          text,
  make           text,
  model          text,
  year           integer,
  km_reading     integer,
  customer_name  text,
  customer_phone text,
  score          integer check (score between 0 and 100),
  status         text not null default 'draft' check (status in ('draft','completed')),
  notes          text,
  public_token   text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create index if not exists vehicle_checkups_created_by_idx on public.vehicle_checkups(created_by, created_at desc);

create table if not exists public.checkup_items (
  id          uuid primary key default gen_random_uuid(),
  checkup_id  uuid not null references public.vehicle_checkups(id) on delete cascade,
  system      text not null,
  item_key    text not null,
  label       text not null,
  position    integer not null default 0,
  status      text check (status in ('ok','warn','urgent','na')),
  measurement text,
  note        text,
  photo_path  text,
  updated_at  timestamptz not null default now(),
  unique (checkup_id, item_key)
);

create index if not exists checkup_items_checkup_idx on public.checkup_items(checkup_id);

alter table public.vehicle_checkups enable row level security;
alter table public.checkup_items    enable row level security;

-- Dono (quem criou) ou admin
create policy vehicle_checkups_owner_all on public.vehicle_checkups for all
  using (created_by = auth.uid() or public.is_admin(auth.uid()))
  with check (created_by = auth.uid() or public.is_admin(auth.uid()));

create policy checkup_items_owner_all on public.checkup_items for all
  using (exists (
    select 1 from public.vehicle_checkups c
    where c.id = checkup_id and (c.created_by = auth.uid() or public.is_admin(auth.uid()))
  ))
  with check (exists (
    select 1 from public.vehicle_checkups c
    where c.id = checkup_id and (c.created_by = auth.uid() or public.is_admin(auth.uid()))
  ));

-- Relatório público: só check-ups finalizados e só o necessário
-- (sem telefone do cliente; só o primeiro nome).
create or replace function public.get_public_checkup(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'score',        c.score,
    'plate',        c.plate,
    'make',         c.make,
    'model',        c.model,
    'year',         c.year,
    'km_reading',   c.km_reading,
    'notes',        c.notes,
    'completed_at', c.completed_at,
    'customer_first_name', nullif(split_part(coalesce(c.customer_name, ''), ' ', 1), ''),
    'mechanic', jsonb_build_object(
      'full_name',  p.full_name,
      'avatar_url', p.avatar_url
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'system', i.system, 'label', i.label, 'status', i.status,
        'measurement', i.measurement, 'note', i.note, 'photo_path', i.photo_path
      ) order by i.position)
      from public.checkup_items i
      where i.checkup_id = c.id and i.status is not null
    ), '[]'::jsonb)
  )
  from public.vehicle_checkups c
  join public.profiles p on p.id = c.created_by
  where c.public_token = p_token and c.status = 'completed';
$$;

grant execute on function public.get_public_checkup(text) to anon, authenticated;

-- Fotos: bucket público (paths com UUID, não listável), escrita só pelo dono.
-- Path: {auth.uid()}/{checkup_id}/{item_key}-{timestamp}.{ext}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkup-photos', 'checkup-photos', true, 8388608,
        array['image/*','application/octet-stream'])
on conflict (id) do nothing;

create policy checkup_photos_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'checkup-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy checkup_photos_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'checkup-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy checkup_photos_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'checkup-photos' and (storage.foldername(name))[1] = auth.uid()::text);
