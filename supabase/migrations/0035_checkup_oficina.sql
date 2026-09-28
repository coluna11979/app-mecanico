-- Check-up passa a ser ferramenta da OFICINA (não do mecânico do marketplace).
-- O check-up pertence à oficina; quem inspecionou é um mecânico da equipe
-- (workshop_mechanics). Pode nascer de uma OS ou avulso, e fica ligado ao
-- cliente/veículo da oficina — base para a Mesa Comercial.
-- (Em 28/09/2026 a tabela estava vazia, então dá pra exigir workshop_id.)

alter table public.vehicle_checkups
  add column if not exists workshop_id          uuid not null references public.workshops(id) on delete cascade,
  add column if not exists workshop_mechanic_id uuid references public.workshop_mechanics(id) on delete set null,
  add column if not exists service_order_id     uuid references public.service_orders(id) on delete set null,
  add column if not exists customer_id          uuid references public.customers(id) on delete set null,
  add column if not exists vehicle_id           uuid references public.vehicles(id) on delete set null;

-- created_by vira só "quem registrou" (login da oficina); não apaga o check-up se o perfil sumir
alter table public.vehicle_checkups drop constraint if exists vehicle_checkups_created_by_fkey;
alter table public.vehicle_checkups alter column created_by drop not null;
alter table public.vehicle_checkups
  add constraint vehicle_checkups_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

create index if not exists vehicle_checkups_workshop_idx on public.vehicle_checkups(workshop_id, created_at desc);
create index if not exists vehicle_checkups_os_idx       on public.vehicle_checkups(service_order_id);
drop index if exists public.vehicle_checkups_created_by_idx;

-- RLS: membros da oficina (ou admin)
drop policy if exists vehicle_checkups_owner_all on public.vehicle_checkups;
drop policy if exists checkup_items_owner_all    on public.checkup_items;

create policy vehicle_checkups_workshop_all on public.vehicle_checkups for all
  using      (public.is_workshop_member(workshop_id, auth.uid()) or public.is_admin(auth.uid()))
  with check (public.is_workshop_member(workshop_id, auth.uid()) or public.is_admin(auth.uid()));

create policy checkup_items_workshop_all on public.checkup_items for all
  using (exists (
    select 1 from public.vehicle_checkups c
    where c.id = checkup_id
      and (public.is_workshop_member(c.workshop_id, auth.uid()) or public.is_admin(auth.uid()))
  ))
  with check (exists (
    select 1 from public.vehicle_checkups c
    where c.id = checkup_id
      and (public.is_workshop_member(c.workshop_id, auth.uid()) or public.is_admin(auth.uid()))
  ));

-- Fotos: pasta = workshop_id. Path: {workshop_id}/{checkup_id}/{item_key}-{ts}.{ext}
drop policy if exists checkup_photos_owner_insert on storage.objects;
drop policy if exists checkup_photos_owner_update on storage.objects;
drop policy if exists checkup_photos_owner_delete on storage.objects;

create policy checkup_photos_workshop_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'checkup-photos'
    and public.is_workshop_member(((storage.foldername(name))[1])::uuid, auth.uid()));

create policy checkup_photos_workshop_update on storage.objects for update to authenticated
  using (bucket_id = 'checkup-photos'
    and public.is_workshop_member(((storage.foldername(name))[1])::uuid, auth.uid()));

create policy checkup_photos_workshop_delete on storage.objects for delete to authenticated
  using (bucket_id = 'checkup-photos'
    and public.is_workshop_member(((storage.foldername(name))[1])::uuid, auth.uid()));

-- Relatório público: agora assinado pela oficina (+ mecânico da equipe)
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
    'workshop', jsonb_build_object(
      'business_name', w.business_name,
      'logo_url',      w.logo_url,
      'city',          w.city,
      'state',         w.state
    ),
    'mechanic_name', wm.name,
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
  join public.workshops w on w.id = c.workshop_id
  left join public.workshop_mechanics wm on wm.id = c.workshop_mechanic_id
  where c.public_token = p_token and c.status = 'completed';
$$;
