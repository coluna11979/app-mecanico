-- Orçamentista: o carro precisa ter MODELO e ANO antes de abrir a OS.
-- A consulta técnica (óleo e filtros) depende disso, e o dono pediu que o agente pergunte o modelo, não só o ano.
--
--  · orc_open_os: recusa carro sem modelo/ano (carro_incompleto) e OS sem carro (carro_obrigatorio)
--  · orc_create_customer: se vier dado de carro sem MODELO, não cadastra nada (modelo_obrigatorio)
--  · orc_add_vehicle (novo): cadastra carro para cliente que já existe (exige modelo; não duplica placa)
--  · orc_update_vehicle_by_id (novo): completa o carro pelo veiculo_id, para corrigir ANTES de abrir a OS (sem OS ainda)
-- Só o service_role executa.

create or replace function public.orc_open_os(p_workshop uuid, p_customer uuid, p_vehicle uuid, p_km integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os    uuid;
  v_num   integer;
  v       vehicles%rowtype;
  v_falta jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from customers where id = p_customer and workshop_id = p_workshop) then
    return jsonb_build_object('ok', false, 'error', 'cliente_invalido');
  end if;
  if p_vehicle is null then
    return jsonb_build_object('ok', false, 'error', 'carro_obrigatorio');
  end if;
  select * into v from vehicles where id = p_vehicle and workshop_id = p_workshop and customer_id = p_customer;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'carro_invalido');
  end if;

  -- Sem modelo e ano não abre: é por eles que se acha a ficha de óleo e filtros e o kit do carro
  if btrim(coalesce(v.model, '')) = '' or orc_norm(v.model) = 'nao informado' then v_falta := v_falta || to_jsonb('modelo'::text); end if;
  if v.year is null then v_falta := v_falta || to_jsonb('ano'::text); end if;
  if jsonb_array_length(v_falta) > 0 then
    return jsonb_build_object('ok', false, 'error', 'carro_incompleto', 'faltando', v_falta,
      'carro', jsonb_build_object('marca', v.make, 'modelo', v.model, 'ano', v.year, 'placa', v.plate));
  end if;

  -- Rascunho vazio do agente (últimos 15 min) para o mesmo cliente e carro: reaproveita (evita OS duplicada se o comando repetir)
  select s.id, s.number into v_os, v_num from service_orders s
   where s.workshop_id = p_workshop and s.customer_id = p_customer and s.vehicle_id is not distinct from p_vehicle
     and s.source = 'agent_orcamento' and s.status = 'open' and s.created_at > now() - interval '15 minutes'
     and not exists (select 1 from service_order_items i where i.service_order_id = s.id)
   order by s.created_at desc limit 1;
  if v_os is not null then return jsonb_build_object('ok', true, 'reused', true, 'os_numero', v_num); end if;

  insert into service_orders (workshop_id, customer_id, vehicle_id, title, status, price, km_reading, source)
  values (p_workshop, p_customer, p_vehicle, 'Orçamento', 'open', 0,
          case when p_km between 1 and 2000000 then p_km end, 'agent_orcamento')
  returning id, number into v_os, v_num;
  return jsonb_build_object('ok', true, 'reused', false, 'os_numero', v_num);
end $$;

create or replace function public.orc_create_customer(
  p_workshop uuid, p_nome text, p_telefone text, p_marca text, p_modelo text, p_ano integer, p_placa text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text := left(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), 100);
  v_phone text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_plate text := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
  v_make  text := left(btrim(coalesce(p_marca, '')), 60);
  v_model text := left(btrim(coalesce(p_modelo, '')), 60);
  v_year  integer := case when p_ano between 1950 and extract(year from now())::int + 1 then p_ano end;
  v_cust  uuid;
  v_veh   uuid;
  v_dup   uuid;
begin
  if length(v_name) < 2 then return jsonb_build_object('ok', false, 'error', 'nome_obrigatorio'); end if;
  if length(v_plate) <> 7 then v_plate := ''; end if;

  -- Carro informado sem modelo: não cadastra nada (o agente pergunta o modelo e chama de novo)
  if (v_plate <> '' or v_make <> '' or v_year is not null) and v_model = '' then
    return jsonb_build_object('ok', false, 'error', 'modelo_obrigatorio');
  end if;

  if v_phone is not null then
    v_dup := match_customer_by_phone(p_workshop, v_phone);
    if v_dup is not null then
      return jsonb_build_object('ok', false, 'error', 'telefone_ja_cadastrado', 'cliente_id', v_dup,
                                'nome', (select full_name from customers where id = v_dup));
    end if;
  end if;
  if v_plate <> '' then
    select v.id, v.customer_id into v_veh, v_dup from vehicles v
     where v.workshop_id = p_workshop and upper(regexp_replace(v.plate, '[^A-Za-z0-9]', '', 'g')) = v_plate limit 1;
    if v_veh is not null then
      return jsonb_build_object('ok', false, 'error', 'placa_ja_cadastrada', 'cliente_id', v_dup, 'veiculo_id', v_veh,
                                'nome', (select full_name from customers where id = v_dup));
    end if;
  end if;

  insert into customers (workshop_id, full_name, phone) values (p_workshop, v_name, v_phone) returning id into v_cust;
  if v_model <> '' then
    insert into vehicles (workshop_id, customer_id, plate, make, model, year)
    values (p_workshop, v_cust, coalesce(nullif(v_plate, ''), 'S/P'), coalesce(nullif(v_make, ''), 'Não informado'), v_model, v_year)
    returning id into v_veh;
  end if;
  return jsonb_build_object('ok', true, 'cliente_id', v_cust, 'veiculo_id', v_veh,
                            'carro_sem_ano', v_veh is not null and v_year is null);
end $$;

/* ── Carro novo para cliente que já existe ─────────────────────────────────── */
create or replace function public.orc_add_vehicle(
  p_workshop uuid, p_customer uuid, p_marca text, p_modelo text, p_ano integer, p_placa text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plate text := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
  v_make  text := left(btrim(coalesce(p_marca, '')), 60);
  v_model text := left(btrim(coalesce(p_modelo, '')), 60);
  v_year  integer := case when p_ano between 1950 and extract(year from now())::int + 1 then p_ano end;
  v_veh   uuid;
  v_dup   uuid;
begin
  if not exists (select 1 from customers where id = p_customer and workshop_id = p_workshop) then
    return jsonb_build_object('ok', false, 'error', 'cliente_invalido');
  end if;
  if v_model = '' then return jsonb_build_object('ok', false, 'error', 'modelo_obrigatorio'); end if;
  if length(v_plate) <> 7 then v_plate := ''; end if;

  if v_plate <> '' then
    select v.id, v.customer_id into v_veh, v_dup from vehicles v
     where v.workshop_id = p_workshop and upper(regexp_replace(v.plate, '[^A-Za-z0-9]', '', 'g')) = v_plate limit 1;
    if v_veh is not null then
      return jsonb_build_object('ok', false, 'error', 'placa_ja_cadastrada', 'cliente_id', v_dup, 'veiculo_id', v_veh,
                                'nome', (select full_name from customers where id = v_dup));
    end if;
  end if;

  insert into vehicles (workshop_id, customer_id, plate, make, model, year)
  values (p_workshop, p_customer, coalesce(nullif(v_plate, ''), 'S/P'), coalesce(nullif(v_make, ''), 'Não informado'), v_model, v_year)
  returning id into v_veh;
  return jsonb_build_object('ok', true, 'veiculo_id', v_veh, 'carro_sem_ano', v_year is null);
end $$;

/* ── Completar o carro pelo próprio carro (corrige ANTES de abrir a OS; pela OS já existe orc_update_vehicle) ───── */
create or replace function public.orc_update_vehicle_by_id(
  p_workshop uuid, p_vehicle uuid, p_marca text, p_modelo text, p_ano integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v       vehicles%rowtype;
  v_make  text := left(btrim(coalesce(p_marca, '')), 60);
  v_model text := left(btrim(coalesce(p_modelo, '')), 60);
  v_year  integer := case when p_ano between 1950 and extract(year from now())::int + 1 then p_ano end;
  v_skip  jsonb := '[]'::jsonb;
begin
  -- Só completa o que está vazio ("Não informado" também conta como vazio); dado já preenchido não é trocado por aqui
  update vehicles set
    make  = case when v_make <> '' and (btrim(coalesce(make, '')) = '' or orc_norm(make) = 'nao informado') then v_make else make end,
    model = case when v_model <> '' and (btrim(coalesce(model, '')) = '' or orc_norm(model) = 'nao informado') then v_model else model end,
    year  = case when v_year is not null and year is null then v_year else year end
  where id = p_vehicle and workshop_id = p_workshop
  returning * into v;
  if not found then return jsonb_build_object('ok', false, 'error', 'carro_nao_encontrado'); end if;

  if v_make <> '' and orc_norm(v.make) <> orc_norm(v_make) then v_skip := v_skip || to_jsonb('marca'::text); end if;
  if v_model <> '' and orc_norm(v.model) <> orc_norm(v_model) then v_skip := v_skip || to_jsonb('modelo'::text); end if;
  if v_year is not null and v.year is distinct from v_year then v_skip := v_skip || to_jsonb('ano'::text); end if;

  return jsonb_build_object('ok', true,
    'carro', jsonb_build_object('marca', v.make, 'modelo', v.model, 'ano', v.year, 'placa', v.plate),
    'nao_alterado_porque_ja_estava_preenchido', v_skip);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'orc_open_os(uuid,uuid,uuid,integer)', 'orc_create_customer(uuid,text,text,text,text,integer,text)',
    'orc_add_vehicle(uuid,uuid,text,text,integer,text)', 'orc_update_vehicle_by_id(uuid,uuid,text,text,integer)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
