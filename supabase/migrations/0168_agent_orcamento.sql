-- Orçamentista: agente interno (chat do dono, módulo 'agentes') que abre OS, lança serviços com as peças,
-- põe o responsável de cada item e mostra os totais e as comissões da OS.
--
-- Tudo aqui reproduz o que a tela de OS já faz (OsItemsEditor / NewOsModal), para os dados cruzarem:
--  · cliente/carro: busca por nome, telefone ou placa; cadastra se não existir (sem duplicar telefone/placa)
--  · serviço: preço digitado → último preço cobrado neste MODELO de carro → preço da Tabela de serviços
--  · peças: kit do serviço por ficha técnica / modelo+ano / geral, e peças avulsas do cadastro; dentro de um
--    serviço a peça entra só com CUSTO (o preço que o cliente paga já está no serviço); tipo do serviço = 'servico'
--    quando há peça (4% sobre serviço + peças) ou 'mao_de_obra' (10%)
--  · responsável por item: colaborador da equipe (workshop_mechanic_id + executor 'workshop')
--  · totais da OS: o gatilho de itens já recalcula price/labor_cost/parts_cost
--
-- Segurança: todas as funções recebem a oficina (p_workshop) do SERVIDOR, validam que cada id é daquela oficina e
-- só o service_role executa (edge function agent-chat). A IA nunca escolhe a oficina.

/* ── Novo template + versão 1 para agente novo ─────────────────────────────── */
alter table public.ai_agents drop constraint if exists ai_agents_template_check;
alter table public.ai_agents add constraint ai_agents_template_check
  check (template in ('socio', 'recepcao', 'followup', 'posvenda', 'orcamento'));

-- A 0113 criou a v1 só dos agentes que já existiam; agente criado depois ficava sem histórico
create or replace function public.ai_agents_first_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into ai_agent_versions (agent_id, workshop_id, version, name, system_prompt, tools, note)
  values (new.id, new.workshop_id, new.version, new.name, new.system_prompt, new.tools, 'Versão inicial')
  on conflict (agent_id, version) do nothing;
  return new;
end $$;
revoke all on function public.ai_agents_first_version() from public, anon, authenticated;
drop trigger if exists ai_agents_first_version on public.ai_agents;
create trigger ai_agents_first_version after insert on public.ai_agents
  for each row execute function public.ai_agents_first_version();

/* ── Auxiliares ────────────────────────────────────────────────────────────── */
create or replace function public.orc_norm(t text)
returns text language sql stable set search_path = public as
$$ select btrim(lower(unaccent(coalesce(t, '')))) $$;

/** Kit de peças do serviço para o carro (mesma escolha da tela): 1) ficha técnica 2) modelo na faixa de anos 3) kit geral */
create or replace function public.orc_kit(p_workshop uuid, p_service uuid, p_vehicle uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  veh    vehicles%rowtype;
  mk     text;
  yr     integer;
  g      text;
  chosen jsonb;
begin
  if p_vehicle is not null then select * into veh from vehicles where id = p_vehicle and workshop_id = p_workshop; end if;
  mk := orc_norm(veh.model);
  yr := veh.year;

  if veh.tech_vehicle_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('part_id', k.part_id, 'description', k.description, 'quantity', k.quantity) order by k.position), '[]'::jsonb)
      into chosen from workshop_service_parts k
     where k.workshop_id = p_workshop and k.service_id = p_service and k.tech_vehicle_id = veh.tech_vehicle_id;
    if jsonb_array_length(chosen) > 0 then return jsonb_build_object('origem', 'ficha_tecnica', 'itens', chosen); end if;
  end if;

  if mk <> '' then
    with r as (
      select k.*, coalesce(k.tech_vehicle_id::text, 'm') as gkey
        from workshop_service_parts k
       where k.workshop_id = p_workshop and k.service_id = p_service
         and k.vehicle_model is not null and orc_norm(k.vehicle_model) = mk
    ), grp as (
      select gkey, min(position) as pos,
             (array_agg(year_from order by position))[1] as yf, (array_agg(year_to order by position))[1] as yt
        from r group by gkey
    )
    select gkey into g from grp
     where yr is null or ((yf is null or yf <= yr) and (yt is null or yt >= yr))
     order by (case when yf is not null or yt is not null then 0 else 1 end), pos
     limit 1;
    if g is not null then
      select coalesce(jsonb_agg(jsonb_build_object('part_id', k.part_id, 'description', k.description, 'quantity', k.quantity) order by k.position), '[]'::jsonb)
        into chosen from workshop_service_parts k
       where k.workshop_id = p_workshop and k.service_id = p_service
         and k.vehicle_model is not null and orc_norm(k.vehicle_model) = mk and coalesce(k.tech_vehicle_id::text, 'm') = g;
      return jsonb_build_object('origem', 'modelo', 'itens', chosen);
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('part_id', k.part_id, 'description', k.description, 'quantity', k.quantity) order by k.position), '[]'::jsonb)
    into chosen from workshop_service_parts k
   where k.workshop_id = p_workshop and k.service_id = p_service and k.vehicle_model is null;
  return jsonb_build_object('origem', case when jsonb_array_length(chosen) > 0 then 'geral' else null end, 'itens', chosen);
end $$;

/* ── Cliente e carro ───────────────────────────────────────────────────────── */
create or replace function public.orc_find_customer(p_workshop uuid, p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q      text := btrim(coalesce(p_query, ''));
  v_plate  text := upper(regexp_replace(btrim(coalesce(p_query, '')), '[^A-Za-z0-9]', '', 'g'));
  v_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  v_out    jsonb;
begin
  if length(v_q) < 2 then return jsonb_build_object('ok', false, 'error', 'consulta_curta'); end if;

  with hits as (
    select c.id, 1 as rank from customers c join vehicles v on v.customer_id = c.id
     where c.workshop_id = p_workshop and length(v_plate) = 7
       and upper(regexp_replace(v.plate, '[^A-Za-z0-9]', '', 'g')) = v_plate
    union all
    select c.id, 2 from customers c
     where c.workshop_id = p_workshop and length(v_digits) >= 8 and c.phone is not null
       and right(regexp_replace(c.phone, '\D', '', 'g'), 8) = right(v_digits, 8)
    union all
    select c.id, 3 from customers c
     where c.workshop_id = p_workshop
       and not exists (select 1 from unnest(string_to_array(regexp_replace(orc_norm(v_q), '[^a-z0-9 ]', ' ', 'g'), ' ')) t
                        where t <> '' and not exists (select 1 from unnest(string_to_array(regexp_replace(orc_norm(c.full_name), '[^a-z0-9 ]', ' ', 'g'), ' ')) w
                                                       where w like t || '%'))
  ), best as (
    select id, min(rank) as rank from hits group by id order by min(rank), id limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'cliente_id', c.id, 'nome', c.full_name, 'telefone', c.phone,
      'carros', (select coalesce(jsonb_agg(jsonb_build_object('veiculo_id', v.id, 'placa', v.plate, 'marca', v.make, 'modelo', v.model, 'ano', v.year) order by v.created_at), '[]'::jsonb)
                   from vehicles v where v.customer_id = c.id),
      'os_abertas', (select coalesce(jsonb_agg(jsonb_build_object('os_numero', s.number, 'titulo', s.title, 'status', s.status) order by s.created_at desc), '[]'::jsonb)
                       from (select * from service_orders s0 where s0.customer_id = c.id and s0.status not in ('completed', 'cancelled')
                              order by s0.created_at desc limit 3) s)
    ) order by b.rank, c.full_name), '[]'::jsonb)
    into v_out
    from best b join customers c on c.id = b.id;

  return jsonb_build_object('ok', true, 'clientes', v_out);
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
  if v_plate <> '' or v_make <> '' or v_model <> '' then
    insert into vehicles (workshop_id, customer_id, plate, make, model, year)
    values (p_workshop, v_cust, coalesce(nullif(v_plate, ''), 'S/P'), coalesce(nullif(v_make, ''), 'Não informado'),
            coalesce(nullif(v_model, ''), 'Não informado'), v_year)
    returning id into v_veh;
  end if;
  return jsonb_build_object('ok', true, 'cliente_id', v_cust, 'veiculo_id', v_veh);
end $$;

/* ── OS ────────────────────────────────────────────────────────────────────── */
create or replace function public.orc_open_os(p_workshop uuid, p_customer uuid, p_vehicle uuid, p_km integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os  uuid;
  v_num integer;
begin
  if not exists (select 1 from customers where id = p_customer and workshop_id = p_workshop) then
    return jsonb_build_object('ok', false, 'error', 'cliente_invalido');
  end if;
  if p_vehicle is not null and not exists (
    select 1 from vehicles where id = p_vehicle and workshop_id = p_workshop and customer_id = p_customer
  ) then
    return jsonb_build_object('ok', false, 'error', 'carro_invalido');
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

/* ── Busca de serviço e peça ───────────────────────────────────────────────── */
create or replace function public.orc_service_lookup(p_workshop uuid, p_texto text, p_os_number integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_veh vehicles%rowtype;
  v_os  uuid;
  out   jsonb;
begin
  if length(btrim(coalesce(p_texto, ''))) < 2 then return jsonb_build_object('ok', false, 'error', 'texto_curto'); end if;
  if p_os_number is not null then
    select s.id into v_os from service_orders s
     where s.workshop_id = p_workshop and s.number = p_os_number order by s.created_at desc limit 1;
    if v_os is not null then
      select v.* into v_veh from service_orders s join vehicles v on v.id = s.vehicle_id where s.id = v_os;
    end if;
  end if;

  for i in 1..2 loop
    select coalesce(jsonb_agg(x.j order by x.rank, x.len), '[]'::jsonb) into out from (
      select jsonb_build_object(
               'servico_id', ws.id, 'nome', ws.name, 'categoria', ws.category, 'preco_tabela', ws.price,
               'ultimo_preco_modelo', case when v_veh.id is null then null else (
                  select round(it.quantity * it.unit_price, 2)
                    from service_order_items it
                    join service_orders so on so.id = it.service_order_id
                    join vehicles vv on vv.id = so.vehicle_id
                   where it.workshop_id = p_workshop and it.kind = 'labor' and it.unit_price > 0
                     and so.status <> 'cancelled' and so.quote_status is null and so.id is distinct from v_os
                     and orc_norm(it.description) = orc_norm(ws.name) and orc_norm(vv.model) = orc_norm(v_veh.model)
                   order by so.created_at desc limit 1) end,
               'kit_origem', orc_kit(p_workshop, ws.id, v_veh.id)->>'origem',
               'kit', (select coalesce(jsonb_agg(jsonb_build_object('peca_id', p.id, 'peca', coalesce(p.name, ki->>'description'),
                                                                     'qtd', (ki->>'quantity')::numeric, 'custo', p.cost)), '[]'::jsonb)
                         from jsonb_array_elements(orc_kit(p_workshop, ws.id, v_veh.id)->'itens') ki
                         left join workshop_parts p on p.id = nullif(ki->>'part_id', '')::uuid)
             ) as j,
             (case when orc_norm(ws.name) = orc_norm(p_texto) then 0 else 1 end) as rank, length(ws.name) as len
        from workshop_services ws
       where ws.workshop_id = p_workshop and ws.active
         and case when i = 1
               then not exists (select 1 from unnest(string_to_array(orc_norm(p_texto), ' ')) t
                                 where t <> '' and orc_norm(ws.name) not like '%' || t || '%')
               else exists (select 1 from unnest(string_to_array(orc_norm(p_texto), ' ')) t
                             where length(t) >= 4 and orc_norm(ws.name) like '%' || t || '%')
             end
       order by 2, 3 limit 5
    ) x;
    exit when jsonb_array_length(out) > 0;
  end loop;

  return jsonb_build_object('ok', true, 'servicos', out,
    'carro', case when v_veh.id is null then null else jsonb_build_object('modelo', v_veh.model, 'ano', v_veh.year) end);
end $$;

create or replace function public.orc_part_lookup(p_workshop uuid, p_texto text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare out jsonb;
begin
  if length(btrim(coalesce(p_texto, ''))) < 2 then return jsonb_build_object('ok', false, 'error', 'texto_curto'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('peca_id', p.id, 'nome', p.name, 'marca', p.brand, 'codigo', p.code,
                                               'custo', p.cost, 'estoque', p.stock_qty) order by p.name), '[]'::jsonb)
    into out from (
      select * from workshop_parts p0
       where p0.workshop_id = p_workshop and p0.active
         and not exists (select 1 from unnest(string_to_array(orc_norm(p_texto), ' ')) t
                          where t <> '' and orc_norm(p0.name || ' ' || coalesce(p0.brand, '') || ' ' || coalesce(p0.code, '')) not like '%' || t || '%')
       order by p0.name limit 8) p;
  return jsonb_build_object('ok', true, 'pecas', out);
end $$;

/* ── Lançar item (serviço + peças) ─────────────────────────────────────────── */
create or replace function public.orc_add_item(
  p_workshop uuid, p_os_number integer, p_servico_id uuid, p_servico_nome text,
  p_preco numeric, p_usar_kit boolean, p_pecas jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os       service_orders%rowtype;
  v_veh      vehicles%rowtype;
  v_svc      workshop_services%rowtype;
  v_name     text;
  v_price    numeric := p_preco;
  v_origin   text;
  v_last     numeric;
  v_kit      jsonb;
  v_specs    jsonb := '[]'::jsonb;     -- peças resolvidas: [{part_id, name, qty, cost, kit}]
  v_problems jsonb := '[]'::jsonb;
  v_warn     jsonb := '[]'::jsonb;
  e          jsonb;
  ki         jsonb;
  spec       jsonb;
  pp         workshop_parts%rowtype;
  v_ids      uuid[];
  v_n        integer;
  v_qty      numeric;
  v_pname    text;
  v_cost     numeric;
  v_item     uuid := gen_random_uuid();
  v_pos      integer;
  v_labor_n  integer;
  v_title    text;
  v_total    numeric;
begin
  select * into v_os from service_orders where workshop_id = p_workshop and number = p_os_number order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'os_nao_encontrada'); end if;
  if v_os.status in ('completed', 'cancelled') then return jsonb_build_object('ok', false, 'error', 'os_fechada'); end if;
  if v_os.vehicle_id is not null then select * into v_veh from vehicles where id = v_os.vehicle_id; end if;

  -- Serviço
  if p_servico_id is not null then
    select * into v_svc from workshop_services where id = p_servico_id and workshop_id = p_workshop;
    if not found then return jsonb_build_object('ok', false, 'error', 'servico_invalido'); end if;
    v_name := v_svc.name;
  else
    v_name := left(btrim(regexp_replace(coalesce(p_servico_nome, ''), '\s+', ' ', 'g')), 200);
    if length(v_name) < 2 then return jsonb_build_object('ok', false, 'error', 'servico_obrigatorio'); end if;
  end if;

  -- Preço: o informado; senão o último cobrado neste modelo de carro; senão o da Tabela de serviços
  if v_price is not null then
    v_origin := 'informado';
  else
    if v_veh.id is not null then
      select round(it.quantity * it.unit_price, 2) into v_last
        from service_order_items it join service_orders so on so.id = it.service_order_id join vehicles vv on vv.id = so.vehicle_id
       where it.workshop_id = p_workshop and it.kind = 'labor' and it.unit_price > 0
         and so.status <> 'cancelled' and so.quote_status is null and so.id <> v_os.id
         and orc_norm(it.description) = orc_norm(v_name) and orc_norm(vv.model) = orc_norm(v_veh.model)
       order by so.created_at desc limit 1;
    end if;
    if v_last is not null then v_price := v_last; v_origin := 'ultimo_preco_do_modelo';
    elsif v_svc.id is not null and coalesce(v_svc.price, 0) > 0 then v_price := v_svc.price; v_origin := 'tabela';
    end if;
  end if;
  if v_price is null or v_price <= 0 then
    return jsonb_build_object('ok', false, 'error', 'preco_necessario', 'servico', v_name);
  end if;

  -- Peças do kit do serviço (para este carro)
  if coalesce(p_usar_kit, false) and v_svc.id is not null then
    v_kit := orc_kit(p_workshop, v_svc.id, v_veh.id);
    for ki in select * from jsonb_array_elements(coalesce(v_kit->'itens', '[]'::jsonb)) loop
      pp := null;
      if nullif(ki->>'part_id', '') is not null then
        select * into pp from workshop_parts where id = (ki->>'part_id')::uuid and workshop_id = p_workshop;
      end if;
      v_specs := v_specs || jsonb_build_object('part_id', pp.id, 'name', coalesce(pp.name, ki->>'description'),
                                               'qty', (ki->>'quantity')::numeric, 'cost', pp.cost, 'kit', true);
      if pp.id is null or coalesce(pp.cost, 0) = 0 then
        v_warn := v_warn || to_jsonb('Peça do kit sem custo cadastrado: ' || coalesce(pp.name, ki->>'description'));
      end if;
    end loop;
  end if;

  -- Peças pedidas à parte: acha no cadastro; fora do cadastro só entra com o custo informado
  for e in select * from jsonb_array_elements(coalesce(p_pecas, '[]'::jsonb)) loop
    v_pname := left(btrim(coalesce(e->>'nome', '')), 120);
    v_qty := coalesce(nullif(e->>'qtd', '')::numeric, 1);
    if v_qty <= 0 then v_qty := 1; end if;
    pp := null; v_ids := null;

    if nullif(e->>'peca_id', '') is not null then
      select * into pp from workshop_parts where id = (e->>'peca_id')::uuid and workshop_id = p_workshop and active;
      if pp.id is null then
        v_problems := v_problems || jsonb_build_object('peca', coalesce(nullif(v_pname, ''), e->>'peca_id'), 'problema', 'peca_id_invalido');
        continue;
      end if;
    elsif v_pname = '' then
      continue;
    else
      select array_agg(p.id order by p.name) into v_ids from workshop_parts p
       where p.workshop_id = p_workshop and p.active
         and not exists (select 1 from unnest(string_to_array(orc_norm(v_pname), ' ')) t
                          where t <> '' and orc_norm(p.name || ' ' || coalesce(p.brand, '') || ' ' || coalesce(p.code, '')) not like '%' || t || '%');
      v_n := coalesce(array_length(v_ids, 1), 0);
      if v_n > 1 then
        select array_agg(p.id) into v_ids from workshop_parts p where p.id = any(v_ids) and orc_norm(p.name) = orc_norm(v_pname);
        v_n := coalesce(array_length(v_ids, 1), 0);
        if v_n <> 1 then
          v_problems := v_problems || jsonb_build_object('peca', v_pname, 'problema', 'varias_no_cadastro',
            'opcoes', (select coalesce(jsonb_agg(jsonb_build_object('peca_id', p.id, 'nome', p.name, 'marca', p.brand, 'custo', p.cost) order by p.name), '[]'::jsonb)
                         from (select * from workshop_parts p1
                                where p1.workshop_id = p_workshop and p1.active
                                  and not exists (select 1 from unnest(string_to_array(orc_norm(v_pname), ' ')) t
                                                   where t <> '' and orc_norm(p1.name || ' ' || coalesce(p1.brand, '') || ' ' || coalesce(p1.code, '')) not like '%' || t || '%')
                                order by p1.name limit 5) p));
          continue;
        end if;
      end if;
      if v_n = 1 then
        select * into pp from workshop_parts where id = v_ids[1];
      end if;
    end if;

    if pp.id is not null then
      v_specs := v_specs || jsonb_build_object('part_id', pp.id, 'name', pp.name, 'qty', v_qty, 'cost', pp.cost, 'kit', false);
      if coalesce(pp.cost, 0) = 0 then v_warn := v_warn || to_jsonb('Peça sem custo cadastrado: ' || pp.name); end if;
    elsif nullif(e->>'custo', '') is not null and (e->>'custo')::numeric >= 0 then
      v_specs := v_specs || jsonb_build_object('part_id', null, 'name', v_pname, 'qty', v_qty, 'cost', (e->>'custo')::numeric, 'kit', false);
      v_warn := v_warn || to_jsonb('Peça fora do cadastro de peças: ' || v_pname);
    else
      v_problems := v_problems || jsonb_build_object('peca', v_pname, 'problema', 'sem_cadastro');
    end if;
  end loop;

  if jsonb_array_length(v_problems) > 0 then
    return jsonb_build_object('ok', false, 'error', 'revisar_pecas', 'problemas', v_problems, 'servico', v_name);
  end if;

  -- Grava: o serviço e, logo abaixo, as peças dele (só custo)
  select coalesce(max(position), -1) + 1 into v_pos from service_order_items where service_order_id = v_os.id;
  insert into service_order_items (id, service_order_id, workshop_id, kind, description, quantity, unit_price, position, service_type, standalone)
  values (v_item, v_os.id, p_workshop, 'labor', v_name, 1, v_price, v_pos,
          case when jsonb_array_length(v_specs) > 0 then 'servico' else 'mao_de_obra' end, false);

  for spec in select * from jsonb_array_elements(v_specs) loop
    v_pos := v_pos + 1;
    insert into service_order_items (service_order_id, workshop_id, kind, description, quantity, unit_price, unit_cost, part_id, used_in_item_id, position, standalone)
    values (v_os.id, p_workshop, 'part', spec->>'name', (spec->>'qty')::numeric, 0,
            case when spec->>'cost' is null then null else (spec->>'cost')::numeric end,
            nullif(spec->>'part_id', '')::uuid, v_item, v_pos, false);
  end loop;

  select count(*) into v_labor_n from service_order_items where service_order_id = v_os.id and kind = 'labor';

  -- OS aberta pelo agente: o título acompanha os serviços (como na Nova OS)
  if v_os.source = 'agent_orcamento' then
    select left(string_agg(description, ' + ' order by position), 200) into v_title
      from service_order_items where service_order_id = v_os.id and kind = 'labor';
    update service_orders set title = v_title where id = v_os.id;
  end if;

  select price into v_total from service_orders where id = v_os.id;
  return jsonb_build_object('ok', true, 'item_numero', v_labor_n, 'servico', v_name, 'preco', v_price, 'origem_preco', v_origin,
    'kit_origem', v_kit->>'origem', 'avisos', v_warn, 'total_os', v_total,
    'pecas', (select coalesce(jsonb_agg(jsonb_build_object('nome', s->>'name', 'qtd', (s->>'qty')::numeric, 'custo', s->>'cost', 'do_kit', (s->>'kit')::boolean)), '[]'::jsonb)
                from jsonb_array_elements(v_specs) s));
end $$;

/* ── Responsável do item ───────────────────────────────────────────────────── */
create or replace function public.orc_set_responsible(p_workshop uuid, p_os_number integer, p_item_number integer, p_colaborador text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os   service_orders%rowtype;
  v_item uuid;
  v_desc text;
  v_ids  uuid[];
  v_m    workshop_mechanics%rowtype;
begin
  select * into v_os from service_orders where workshop_id = p_workshop and number = p_os_number order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'os_nao_encontrada'); end if;
  if v_os.status in ('completed', 'cancelled') then return jsonb_build_object('ok', false, 'error', 'os_fechada'); end if;

  -- Item N = o N-ésimo serviço da OS, na ordem
  select id, description into v_item, v_desc from (
    select i.id, i.description, row_number() over (order by i.position) as n
      from service_order_items i where i.service_order_id = v_os.id and i.kind = 'labor'
  ) t where n = p_item_number;
  if v_item is null then return jsonb_build_object('ok', false, 'error', 'item_nao_encontrado'); end if;

  select array_agg(m.id order by m.name) into v_ids from workshop_mechanics m
   where m.workshop_id = p_workshop and m.active
     and exists (select 1 from unnest(string_to_array(regexp_replace(orc_norm(p_colaborador), '[^a-z0-9 ]', ' ', 'g'), ' ')) t where t <> '')
     and not exists (select 1 from unnest(string_to_array(regexp_replace(orc_norm(p_colaborador), '[^a-z0-9 ]', ' ', 'g'), ' ')) t
                      where t <> '' and not exists (select 1 from unnest(string_to_array(regexp_replace(orc_norm(m.name), '[^a-z0-9 ]', ' ', 'g'), ' ')) w
                                                     where w like t || '%'));
  if coalesce(array_length(v_ids, 1), 0) = 0 then return jsonb_build_object('ok', false, 'error', 'colaborador_nao_encontrado'); end if;
  if array_length(v_ids, 1) > 1 then
    return jsonb_build_object('ok', false, 'error', 'varios_colaboradores',
      'opcoes', (select jsonb_agg(m.name order by m.name) from workshop_mechanics m where m.id = any(v_ids)));
  end if;
  select * into v_m from workshop_mechanics where id = v_ids[1];

  update service_order_items set workshop_mechanic_id = v_m.id, executor = 'workshop' where id = v_item;
  return jsonb_build_object('ok', true, 'item_numero', p_item_number, 'servico', v_desc, 'colaborador', v_m.name);
end $$;

/* ── Dados da OS para o resumo (a comissão é calculada na edge function, com as mesmas regras da tela) ─── */
create or replace function public.orc_os_data(p_workshop uuid, p_os_number integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_os service_orders%rowtype;
begin
  select * into v_os from service_orders where workshop_id = p_workshop and number = p_os_number order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'os_nao_encontrada'); end if;
  return jsonb_build_object('ok', true,
    'os', jsonb_build_object('numero', v_os.number, 'status', v_os.status, 'titulo', v_os.title, 'preco', v_os.price,
                             'desconto', v_os.discount, 'cliente_trouxe_peca', coalesce(v_os.customer_brought_parts, false),
                             'comissao_manual', coalesce(v_os.commission_manual, false),
                             'cliente', (select full_name from customers where id = v_os.customer_id),
                             'carro', (select concat_ws(' ', model, year, plate) from vehicles where id = v_os.vehicle_id)),
    'itens', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', i.id, 'kind', i.kind, 'description', i.description, 'quantity', i.quantity, 'unit_price', i.unit_price,
                'unit_cost', i.unit_cost, 'used_in_item_id', i.used_in_item_id, 'mechanic_id', i.workshop_mechanic_id,
                'executor', i.executor, 'service_type', i.service_type, 'commission_amount', i.commission_amount,
                'standalone', i.standalone) order by i.position), '[]'::jsonb)
                from service_order_items i where i.service_order_id = v_os.id));
end $$;

/* ── Permissões: só o service_role (edge function) executa ─────────────────── */
do $$
declare f text;
begin
  foreach f in array array[
    'orc_norm(text)', 'orc_kit(uuid,uuid,uuid)', 'orc_find_customer(uuid,text)',
    'orc_create_customer(uuid,text,text,text,text,integer,text)', 'orc_open_os(uuid,uuid,uuid,integer)',
    'orc_service_lookup(uuid,text,integer)', 'orc_part_lookup(uuid,text)',
    'orc_add_item(uuid,integer,uuid,text,numeric,boolean,jsonb)', 'orc_set_responsible(uuid,integer,integer,text)',
    'orc_os_data(uuid,integer)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
