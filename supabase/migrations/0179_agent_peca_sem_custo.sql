-- Orçamentista: NÃO lança peça sem custo. Peça sem custo > 0 (do cadastro, do kit ou fora do cadastro) volta como
-- problema (sem_custo / kit_sem_custo / sem_cadastro) e nada é gravado: o agente pergunta o custo ao dono.
-- Também vale para adicionar/alterar peça em orc_edit_item.

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
      -- Peça sem custo não entra: o custo é o que forma o lucro e a comissão da OS
      if pp.id is null or coalesce(pp.cost, 0) <= 0 then
        v_problems := v_problems || jsonb_build_object('peca', coalesce(pp.name, ki->>'description'), 'problema', 'kit_sem_custo');
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
      -- Custo do cadastro; se a peça está sem custo, só entra com o custo informado agora (> 0)
      v_cost := case when coalesce(pp.cost, 0) > 0 then pp.cost else nullif(e->>'custo', '')::numeric end;
      if coalesce(v_cost, 0) <= 0 then
        v_problems := v_problems || jsonb_build_object('peca', pp.name, 'problema', 'sem_custo');
        continue;
      end if;
      v_specs := v_specs || jsonb_build_object('part_id', pp.id, 'name', pp.name, 'qty', v_qty, 'cost', v_cost, 'kit', false);
    elsif nullif(e->>'custo', '') is not null and (e->>'custo')::numeric > 0 then
      v_specs := v_specs || jsonb_build_object('part_id', null, 'name', v_pname, 'qty', v_qty, 'cost', (e->>'custo')::numeric, 'kit', false);
      v_warn := v_warn || to_jsonb('Peça fora do cadastro de peças: ' || v_pname);
    else
      v_problems := v_problems || jsonb_build_object('peca', v_pname, 'problema', 'sem_cadastro');  -- fora do cadastro e sem custo
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

create or replace function public.orc_edit_item(
  p_workshop uuid, p_os_number integer, p_item_number integer, p_acao text,
  p_nome text default null, p_preco numeric default null,
  p_peca text default null, p_qtd numeric default null, p_custo numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os    service_orders%rowtype;
  v_item  uuid;
  v_desc  text;
  v_part  service_order_items%rowtype;
  v_ids   uuid[];
  v_n     integer;
  v_pp    workshop_parts%rowtype;
  v_pos   integer;
  v_title text;
  v_total numeric;
  v_cnt   integer;
begin
  if p_acao not in ('alterar_servico', 'remover_servico', 'alterar_peca', 'remover_peca', 'adicionar_peca') then
    return jsonb_build_object('ok', false, 'error', 'acao_invalida');
  end if;
  select * into v_os from service_orders where workshop_id = p_workshop and number = p_os_number order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'os_nao_encontrada'); end if;
  if v_os.status in ('completed', 'cancelled') then return jsonb_build_object('ok', false, 'error', 'os_fechada'); end if;

  select id, description into v_item, v_desc from (
    select i.id, i.description, row_number() over (order by i.position) as n
      from service_order_items i where i.service_order_id = v_os.id and i.kind = 'labor'
  ) t where n = p_item_number;
  if v_item is null then return jsonb_build_object('ok', false, 'error', 'item_nao_encontrado'); end if;

  if p_acao = 'alterar_servico' then
    if nullif(btrim(coalesce(p_nome, '')), '') is null and p_preco is null then return jsonb_build_object('ok', false, 'error', 'nada_para_alterar'); end if;
    if p_preco is not null and p_preco <= 0 then return jsonb_build_object('ok', false, 'error', 'preco_invalido'); end if;
    update service_order_items set
      description = coalesce(nullif(left(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), 200), ''), description),
      unit_price = coalesce(p_preco, unit_price)
    where id = v_item;

  elsif p_acao = 'remover_servico' then
    delete from service_order_items where used_in_item_id = v_item;
    delete from service_order_items where id = v_item;

  else
    -- Peças ligadas a este serviço
    if p_acao in ('alterar_peca', 'remover_peca') then
      if nullif(btrim(coalesce(p_peca, '')), '') is null then return jsonb_build_object('ok', false, 'error', 'peca_obrigatoria'); end if;
      select array_agg(i.id order by i.position) into v_ids from service_order_items i
       where i.used_in_item_id = v_item and i.kind = 'part'
         and not exists (select 1 from unnest(string_to_array(orc_norm(p_peca), ' ')) t where t <> '' and orc_norm(i.description) not like '%' || t || '%');
      v_n := coalesce(array_length(v_ids, 1), 0);
      if v_n = 0 then
        return jsonb_build_object('ok', false, 'error', 'peca_nao_encontrada_no_servico',
          'pecas_do_servico', (select coalesce(jsonb_agg(i.description order by i.position), '[]'::jsonb) from service_order_items i where i.used_in_item_id = v_item and i.kind = 'part'));
      end if;
      if v_n > 1 then
        return jsonb_build_object('ok', false, 'error', 'varias_pecas',
          'opcoes', (select jsonb_agg(i.description order by i.position) from service_order_items i where i.id = any(v_ids)));
      end if;
      select * into v_part from service_order_items where id = v_ids[1];
    end if;

    if p_acao = 'remover_peca' then
      delete from service_order_items where id = v_part.id;

    elsif p_acao = 'alterar_peca' then
      if p_qtd is null and p_custo is null then return jsonb_build_object('ok', false, 'error', 'nada_para_alterar'); end if;
      if (p_qtd is not null and p_qtd <= 0) or (p_custo is not null and p_custo <= 0) then return jsonb_build_object('ok', false, 'error', 'valor_invalido'); end if;
      update service_order_items set quantity = coalesce(p_qtd, quantity), unit_cost = coalesce(p_custo, unit_cost) where id = v_part.id;

    else -- adicionar_peca
      if nullif(btrim(coalesce(p_peca, '')), '') is null then return jsonb_build_object('ok', false, 'error', 'peca_obrigatoria'); end if;
      if p_qtd is not null and p_qtd <= 0 then return jsonb_build_object('ok', false, 'error', 'valor_invalido'); end if;
      select array_agg(p.id order by p.name) into v_ids from workshop_parts p
       where p.workshop_id = p_workshop and p.active
         and not exists (select 1 from unnest(string_to_array(orc_norm(p_peca), ' ')) t
                          where t <> '' and orc_norm(p.name || ' ' || coalesce(p.brand, '') || ' ' || coalesce(p.code, '')) not like '%' || t || '%');
      v_n := coalesce(array_length(v_ids, 1), 0);
      if v_n > 1 then
        select array_agg(p.id) into v_ids from workshop_parts p where p.id = any(v_ids) and orc_norm(p.name) = orc_norm(p_peca);
        v_n := coalesce(array_length(v_ids, 1), 0);
        if v_n <> 1 then
          return jsonb_build_object('ok', false, 'error', 'varias_no_cadastro',
            'opcoes', (select coalesce(jsonb_agg(jsonb_build_object('nome', p.name, 'marca', p.brand, 'custo', p.cost)), '[]'::jsonb)
                         from (select * from workshop_parts p1 where p1.workshop_id = p_workshop and p1.active
                                  and not exists (select 1 from unnest(string_to_array(orc_norm(p_peca), ' ')) t
                                                   where t <> '' and orc_norm(p1.name || ' ' || coalesce(p1.brand, '') || ' ' || coalesce(p1.code, '')) not like '%' || t || '%')
                                order by p1.name limit 5) p));
        end if;
      end if;
      select coalesce(max(position), -1) + 1 into v_pos from service_order_items where service_order_id = v_os.id;
      if v_n = 1 then
        select * into v_pp from workshop_parts where id = v_ids[1];
        if coalesce(p_custo, v_pp.cost, 0) <= 0 or (p_custo is null and coalesce(v_pp.cost, 0) <= 0) then
          return jsonb_build_object('ok', false, 'error', 'sem_custo_informe_o_custo', 'peca', v_pp.name);
        end if;
        insert into service_order_items (service_order_id, workshop_id, kind, description, quantity, unit_price, unit_cost, part_id, used_in_item_id, position, standalone)
        values (v_os.id, p_workshop, 'part', v_pp.name, coalesce(p_qtd, 1), 0, coalesce(p_custo, v_pp.cost), v_pp.id, v_item, v_pos, false);
      elsif p_custo is not null and p_custo > 0 then
        insert into service_order_items (service_order_id, workshop_id, kind, description, quantity, unit_price, unit_cost, part_id, used_in_item_id, position, standalone)
        values (v_os.id, p_workshop, 'part', left(btrim(p_peca), 120), coalesce(p_qtd, 1), 0, p_custo, null, v_item, v_pos, false);
      else
        return jsonb_build_object('ok', false, 'error', 'sem_cadastro_informe_o_custo', 'peca', p_peca);
      end if;
    end if;
  end if;

  -- OS aberta pelo agente: o título acompanha os serviços
  if v_os.source = 'agent_orcamento' then
    select left(string_agg(description, ' + ' order by position), 200) into v_title from service_order_items where service_order_id = v_os.id and kind = 'labor';
    update service_orders set title = v_title where id = v_os.id;
  end if;

  select price into v_total from service_orders where id = v_os.id;
  select count(*) into v_cnt from service_order_items where service_order_id = v_os.id and kind = 'labor';
  return jsonb_build_object('ok', true, 'acao', p_acao, 'item_numero', p_item_number, 'servico_antes', v_desc, 'total_os', v_total,
    'servicos_na_os', v_cnt,
    'servicos', (select coalesce(jsonb_agg(jsonb_build_object('n', t.n, 'servico', t.description, 'preco', round(t.quantity * t.unit_price, 2),
        'pecas', (select coalesce(jsonb_agg(jsonb_build_object('nome', p.description, 'qtd', p.quantity, 'custo', p.unit_cost) order by p.position), '[]'::jsonb)
                    from service_order_items p where p.used_in_item_id = t.id and p.kind = 'part')) order by t.n), '[]'::jsonb)
                   from (select i.*, row_number() over (order by i.position) n from service_order_items i where i.service_order_id = v_os.id and i.kind = 'labor') t));
end $$;
