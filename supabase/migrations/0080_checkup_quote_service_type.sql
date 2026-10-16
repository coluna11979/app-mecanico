-- Orçamento do check-up num campo só: "Serviço + peças" (descrição + valor).
-- Na aprovação pelo link, o item entra na OS como "Serviço + peças" (service_type = 'servico'),
-- que é a regra de 4% sobre serviço + peças — e não como "Mão de obra" (10%).
-- Única mudança na função: a coluna service_type no insert do serviço.

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
        insert into service_order_items (service_order_id, workshop_id, kind, service_type, description, quantity, unit_price, position)
        values (os_id, c.workshop_id, 'labor', 'servico', coalesce(nullif(trim(it.quote_service), ''), it.label), 1, it.quote_labor, pos);
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
