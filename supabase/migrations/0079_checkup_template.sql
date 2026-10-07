-- Modelos de check-up: completo, revisão básica, troca de óleo, pré-viagem, freios e suspensão,
-- veículo usado ou montado na hora (só os sistemas que o cliente apontou).
-- O modelo só define quais itens nascem no check-up (os itens continuam em checkup_items);
-- template_key guarda qual foi escolhido para o painel e o relatório mostrarem o tipo.
-- null = check-up completo (todos os check-ups anteriores).
alter table public.vehicle_checkups
  add column if not exists template_key text;

-- Relatório público: + tipo do check-up e total de itens (para "X de N avaliados")
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
    'template_key',  c.template_key,
    'items_total',   (select count(*) from public.checkup_items t where t.checkup_id = c.id),
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

grant execute on function public.get_public_checkup(text) to anon, authenticated;
