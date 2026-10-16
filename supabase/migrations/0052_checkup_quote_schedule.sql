-- Check-up que vende: orçamento por item, o cliente aprova pelo link e escolhe o horário.
-- 1) checkup_items: orçamento (serviço + peça) e a decisão do cliente
-- 2) vehicle_checkups: funil (enviado → visto → respondido → virou OS)
-- 3) workshop_schedule: horário de atendimento da oficina (vagas por horário)
-- 4) Funções públicas pelo token do relatório: ver horários livres e responder

-- ── 1. Orçamento por item ──────────────────────────────────────────────────
alter table public.checkup_items
  add column if not exists quote_service     text,
  add column if not exists quote_labor       numeric check (quote_labor >= 0),
  add column if not exists quote_part        text,
  add column if not exists quote_part_id     uuid references public.workshop_parts(id) on delete set null,
  add column if not exists quote_parts       numeric check (quote_parts >= 0),
  add column if not exists customer_decision text check (customer_decision in ('approve', 'remind', 'decline')),
  add column if not exists remind_on         date;

-- ── 2. Funil de venda do check-up ─────────────────────────────────────────
alter table public.vehicle_checkups
  add column if not exists quote_sent_at          timestamptz,
  add column if not exists customer_viewed_at     timestamptz,
  add column if not exists customer_responded_at  timestamptz,
  add column if not exists customer_scheduled_at  timestamptz,
  add column if not exists sale_os_id             uuid references public.service_orders(id) on delete set null;

-- ── 3. Horário de atendimento ────────────────────────────────────────────
create table if not exists public.workshop_schedule (
  workshop_id     uuid primary key references public.workshops(id) on delete cascade,
  weekdays        int[] not null default '{1,2,3,4,5,6}',          -- 0 = domingo … 6 = sábado
  open_time       time not null default '08:00',
  close_time      time not null default '18:00',
  saturday_close  time          default '12:00',                   -- null = igual aos outros dias
  slot_minutes    int  not null default 60 check (slot_minutes between 15 and 240),
  cars_per_slot   int  not null default 2  check (cars_per_slot between 1 and 50),
  updated_at      timestamptz not null default now()
);

alter table public.workshop_schedule enable row level security;
drop policy if exists workshop_schedule_members on public.workshop_schedule;
create policy workshop_schedule_members on public.workshop_schedule for all
  using      (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

drop trigger if exists trg_workshop_schedule_touch on public.workshop_schedule;
create trigger trg_workshop_schedule_touch before update on public.workshop_schedule
  for each row execute function public.touch_updated_at();

-- Horários livres de um dia (hora de Brasília), respeitando vagas por horário.
-- security invoker: no app obedece o RLS de quem chama; pelas funções do link roda como o dono delas.
create or replace function public.workshop_free_slots(p_workshop uuid, p_day date)
returns timestamptz[] language plpgsql stable security invoker set search_path = public as $$
declare
  s workshop_schedule;
  t time; close_t time; ts timestamptz; busy int;
  res timestamptz[] := '{}';
begin
  select * into s from workshop_schedule where workshop_id = p_workshop;
  if not found then
    s.weekdays := '{1,2,3,4,5,6}'; s.open_time := '08:00'; s.close_time := '18:00';
    s.saturday_close := '12:00'; s.slot_minutes := 60; s.cars_per_slot := 2;
  end if;
  if not (extract(dow from p_day)::int = any (s.weekdays)) then return res; end if;
  close_t := case when extract(dow from p_day) = 6 and s.saturday_close is not null then s.saturday_close else s.close_time end;
  t := s.open_time;
  while t + make_interval(mins => s.slot_minutes) <= close_t loop
    ts := (p_day + t) at time zone 'America/Sao_Paulo';
    if ts > now() + interval '1 hour' then
      select count(*) into busy from service_orders
       where workshop_id = p_workshop and status not in ('completed', 'cancelled')
         and scheduled_at >= ts and scheduled_at < ts + make_interval(mins => s.slot_minutes);
      if busy < s.cars_per_slot then res := res || ts; end if;
    end if;
    t := t + make_interval(mins => s.slot_minutes);
  end loop;
  return res;
end $$;

-- ── 4. Link público do check-up ─────────────────────────────────────────────
-- Relatório: + orçamento, decisão e se já foi respondido
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
    'responded_at',  c.customer_responded_at,
    'scheduled_at',  c.customer_scheduled_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'system', i.system, 'label', i.label, 'status', i.status,
        'measurement', i.measurement, 'note', i.note, 'photo_path', i.photo_path,
        'quote_service', i.quote_service, 'quote_labor', i.quote_labor,
        'quote_part', i.quote_part, 'quote_parts', i.quote_parts,
        'decision', i.customer_decision
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

-- Cliente abriu o link (primeira vez)
create or replace function public.checkup_mark_viewed(p_token text)
returns void language sql security definer set search_path = public as $$
  update vehicle_checkups set customer_viewed_at = now()
   where public_token = p_token and status = 'completed' and customer_viewed_at is null;
$$;

-- Horários livres para o cliente escolher (só de check-up finalizado)
create or replace function public.checkup_public_slots(p_token text, p_day date)
returns timestamptz[] language plpgsql stable security definer set search_path = public as $$
declare w uuid;
begin
  select workshop_id into w from vehicle_checkups where public_token = p_token and status = 'completed';
  if w is null or p_day < current_date or p_day > current_date + 60 then return '{}'; end if;
  return workshop_free_slots(w, p_day);
end $$;

-- Cliente responde: decisão por item (+ horário). O que aprovou vira OS; "lembrar" vira recomendação.
create or replace function public.checkup_customer_respond(p_token text, p_decisions jsonb, p_schedule timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c vehicle_checkups;
  w workshops;
  d jsonb; it checkup_items;
  os_id uuid; os_num int; pos int;
  approved int := 0; total numeric := 0;
begin
  select * into c from vehicle_checkups where public_token = p_token and status = 'completed' for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Relatório não encontrado'); end if;
  if c.customer_responded_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Este orçamento já foi respondido');
  end if;
  select * into w from workshops where id = c.workshop_id;

  -- Decisões (só itens com problema)
  for d in select * from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb)) loop
    if d->>'decision' not in ('approve', 'remind', 'decline') then continue; end if;
    update checkup_items
       set customer_decision = d->>'decision',
           remind_on = case when d->>'decision' = 'remind' then current_date + 30 else null end
     where id = (d->>'id')::uuid and checkup_id = c.id and status in ('warn', 'urgent');
  end loop;

  select count(*), coalesce(sum(coalesce(quote_labor, 0) + coalesce(quote_parts, 0)), 0) into approved, total
    from checkup_items
   where checkup_id = c.id and customer_decision = 'approve'
     and coalesce(quote_labor, 0) + coalesce(quote_parts, 0) > 0;

  if approved > 0 then
    if p_schedule is not null and not (p_schedule = any (workshop_free_slots(c.workshop_id, (p_schedule at time zone 'America/Sao_Paulo')::date))) then
      return jsonb_build_object('ok', false, 'error', 'Esse horário acabou de ser ocupado. Escolha outro.');
    end if;

    -- Usa a OS de origem do check-up (se ainda aberta) ou abre uma nova
    select id into os_id from service_orders
     where id = c.service_order_id and status not in ('completed', 'cancelled');
    if os_id is null then
      insert into service_orders (workshop_id, customer_id, vehicle_id, title, category, status, price,
                                  km_reading, approved_at, approval_channel, scheduled_at, description)
      values (c.workshop_id, c.customer_id, c.vehicle_id, 'Serviços aprovados no check-up', 'Check-up', 'approved', 0,
              c.km_reading, now(), 'link', p_schedule, 'Aprovado pelo cliente no link do check-up')
      returning id into os_id;
    else
      update service_orders
         set status = case when status in ('open', 'awaiting_approval') then 'approved' else status end,
             approved_at = coalesce(approved_at, now()), approval_channel = coalesce(approval_channel, 'link'),
             scheduled_at = coalesce(p_schedule, scheduled_at)
       where id = os_id;
    end if;

    select coalesce(max(position), -1) + 1 into pos from service_order_items where service_order_id = os_id;
    for it in select * from checkup_items where checkup_id = c.id and customer_decision = 'approve' order by position loop
      if coalesce(it.quote_labor, 0) > 0 then
        insert into service_order_items (service_order_id, workshop_id, kind, description, quantity, unit_price, position)
        values (os_id, c.workshop_id, 'labor', coalesce(nullif(trim(it.quote_service), ''), it.label), 1, it.quote_labor, pos);
        pos := pos + 1;
      end if;
      if coalesce(it.quote_parts, 0) > 0 then
        insert into service_order_items (service_order_id, workshop_id, kind, description, quantity, unit_price, unit_cost, part_id, position)
        values (os_id, c.workshop_id, 'part', coalesce(nullif(trim(it.quote_part), ''), 'Peça — ' || it.label), 1, it.quote_parts,
                (select cost from workshop_parts where id = it.quote_part_id), it.quote_part_id, pos);
        pos := pos + 1;
      end if;
    end loop;
    select number into os_num from service_orders where id = os_id;
  end if;

  -- "Me lembra depois": vira recomendação (aparece em Dinheiro na mesa / ficha do cliente)
  insert into service_recommendations (workshop_id, customer_id, vehicle_id, description, source)
  select c.workshop_id, c.customer_id, c.vehicle_id,
         i.label || coalesce(' — ' || nullif(i.note, ''), '') || ' (cliente pediu para lembrar em ' || to_char(i.remind_on, 'DD/MM') || ')',
         'checkup'
    from checkup_items i where i.checkup_id = c.id and i.customer_decision = 'remind';

  update vehicle_checkups
     set customer_responded_at = now(), customer_viewed_at = coalesce(customer_viewed_at, now()),
         customer_scheduled_at = case when approved > 0 then p_schedule end,
         sale_os_id = coalesce(os_id, sale_os_id)
   where id = c.id;

  -- Aviso para o dono da oficina
  insert into notifications (user_id, title, body, type)
  values (w.profile_id,
          case when approved > 0 then '✅ Cliente aprovou o check-up' else 'Cliente respondeu o check-up' end,
          coalesce(c.customer_name, 'Cliente') || ' · ' || coalesce(c.plate, '') ||
          case when approved > 0
               then ' — ' || approved || ' item(ns), R$ ' || to_char(total, 'FM999G999G990D00') ||
                    case when p_schedule is not null
                         then ' · traz o carro ' || to_char(p_schedule at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') else '' end ||
                    ' · OS nº ' || lpad(os_num::text, 4, '0')
               else ' — nenhum item aprovado agora' end,
          'checkup');

  return jsonb_build_object('ok', true, 'approved', approved, 'total', total, 'os_number', os_num);
end $$;

revoke all on function public.workshop_free_slots(uuid, date) from public, anon;
grant execute on function public.workshop_free_slots(uuid, date) to authenticated;
grant execute on function public.get_public_checkup(text)                             to anon, authenticated;
grant execute on function public.checkup_mark_viewed(text)                            to anon, authenticated;
grant execute on function public.checkup_public_slots(text, date)                     to anon, authenticated;
grant execute on function public.checkup_customer_respond(text, jsonb, timestamptz)   to anon, authenticated;
