-- O mecânico aponta, no check-up, a peça a trocar e o serviço a fazer em cada item 🟡/🔴.
-- São as mesmas colunas do orçamento (quote_part / quote_service): o comercial já recebe
-- preenchido e só coloca o preço (o app sugere pelo cadastro).
-- Link do mecânico (0054): passa a gravar esses campos e a devolver os nomes do cadastro
-- de peças e da tabela de serviços — só nomes, nunca custo ou preço.

create or replace function public.mech_checkup_open(p_token text, p_device text default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c   vehicle_checkups;
  mn  text;
  wn  text;
  car json;
begin
  select * into c from vehicle_checkups where mechanic_token = p_token and p_token is not null;
  if c.id is null then return json_build_object('ok', false, 'error', 'Link inválido. Peça um novo para a oficina.'); end if;

  select name into mn from workshop_mechanics where id = c.workshop_mechanic_id;
  select business_name into wn from workshops where id = c.workshop_id;
  car := json_build_object('plate', c.plate, 'make', c.make, 'model', c.model, 'year', c.year,
                           'km_reading', c.km_reading, 'mechanic_name', mn, 'workshop_name', wn);

  if c.status = 'draft' and c.mechanic_token_expires_at < now() then
    return json_build_object('ok', false, 'error', 'Link vencido. Peça um novo para a oficina.', 'car', car);
  end if;

  begin
    perform _mech_checkup(p_token, p_device, false);
  exception when others then
    if sqlerrm = 'PIN necessário' then
      return json_build_object('ok', true, 'need_pin', true, 'car', car);
    end if;
    raise;
  end;

  update checkup_mechanic_devices set last_used_at = now()
   where token_hash = encode(digest(coalesce(p_device, ''), 'sha256'), 'hex');
  if c.mechanic_opened_at is null then
    update vehicle_checkups set mechanic_opened_at = now() where id = c.id;
  end if;

  return json_build_object(
    'ok', true, 'need_pin', false, 'car', car,
    'checkup', json_build_object(
      'id', c.id, 'workshop_id', c.workshop_id, 'status', c.status, 'score', c.score,
      'notes', c.notes, 'upload_key', case when c.status = 'draft' then c.mechanic_upload_key end,
      'customer_first_name', nullif(split_part(coalesce(c.customer_name, ''), ' ', 1), '')),
    'items', coalesce((
      select json_agg(json_build_object(
        'id', i.id, 'checkup_id', i.checkup_id, 'system', i.system, 'item_key', i.item_key,
        'label', i.label, 'position', i.position, 'status', i.status,
        'measurement', i.measurement, 'note', i.note, 'photo_path', i.photo_path,
        'quote_part', i.quote_part, 'quote_service', i.quote_service
      ) order by i.position)
      from checkup_items i where i.checkup_id = c.id), '[]'::json),
    -- Sugestões para o mecânico apontar a peça/serviço (só nomes)
    'catalog', json_build_object(
      'parts', coalesce((select json_agg(p.name order by p.name) from workshop_parts p
                          where p.workshop_id = c.workshop_id and p.active), '[]'::json),
      'services', coalesce((select json_agg(s.name order by s.name) from workshop_services s
                             where s.workshop_id = c.workshop_id and s.active), '[]'::json)));
end;
$$;

-- p_patch aceita só: status, measurement, note, photo_path, quote_part, quote_service
create or replace function public.mech_checkup_update_items(p_token text, p_device text, p_items uuid[], p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c vehicle_checkups;
  st text := p_patch->>'status';
  ph text := p_patch->>'photo_path';
begin
  c := _mech_checkup(p_token, p_device, true);
  if p_patch ? 'status' and st is not null and st not in ('ok', 'warn', 'urgent', 'na') then
    raise exception 'Status inválido';
  end if;
  if p_patch ? 'photo_path' and ph is not null
     and ph not like c.workshop_id::text || '/' || c.id::text || '/%' then
    raise exception 'Foto inválida';
  end if;

  update checkup_items i set
    status        = case when p_patch ? 'status'        then st else i.status end,
    measurement   = case when p_patch ? 'measurement'   then left(p_patch->>'measurement', 40) else i.measurement end,
    note          = case when p_patch ? 'note'          then left(p_patch->>'note', 500) else i.note end,
    photo_path    = case when p_patch ? 'photo_path'    then ph else i.photo_path end,
    quote_part    = case when p_patch ? 'quote_part'    then nullif(trim(left(p_patch->>'quote_part', 120)), '') else i.quote_part end,
    quote_service = case when p_patch ? 'quote_service' then nullif(trim(left(p_patch->>'quote_service', 120)), '') else i.quote_service end,
    updated_at    = now()
  where i.checkup_id = c.id and i.id = any(p_items);

  update vehicle_checkups
     set mechanic_started_at = coalesce(mechanic_started_at, now()), updated_at = now()
   where id = c.id;
end;
$$;
