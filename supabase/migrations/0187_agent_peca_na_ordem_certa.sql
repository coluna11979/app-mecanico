-- Orçamentista: "adicionar_peca" num serviço já lançado gravava a peça no FIM da OS. A tela e a view de comissão
-- ligam a peça ao serviço pela ordem das linhas, então a peça aparecia no último serviço (ex.: coxim do item 1
-- caindo dentro da troca de óleo do item 2). Agora a peça entra logo abaixo do serviço certo e o serviço passa a
-- "servico" (não mais "só mão de obra"). Também reordena as OS já afetadas.

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
  v_ids2  uuid[];
  v_allowed text[];
  v_cat   text;
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
      -- Mesma regra do lançamento: peça tem que ser da família do serviço
      select category into v_cat from workshop_services where workshop_id = p_workshop and orc_norm(name) = orc_norm(v_desc) limit 1;
      v_allowed := orc_part_cats_for_service(v_cat);
      if v_allowed is not null and v_n > 0 then
        select array_agg(p.id order by p.name) into v_ids2 from workshop_parts p where p.id = any(v_ids) and (p.category is null or p.category = any(v_allowed));
        if coalesce(array_length(v_ids2, 1), 0) = 0 and p_custo is null then
          return jsonb_build_object('ok', false, 'error', 'categoria_diferente', 'servico_categoria', v_cat,
            'achadas', (select coalesce(jsonb_agg(jsonb_build_object('nome', p.name, 'categoria', p.category)), '[]'::jsonb)
                          from (select name, category from workshop_parts where id = any(v_ids) order by name limit 5) p));
        end if;
        v_ids := v_ids2;
        v_n := coalesce(array_length(v_ids, 1), 0);
      end if;
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
      -- A peça entra logo abaixo do serviço (e das peças que ele já tem): a tela e a comissão ligam a peça
      -- ao serviço pela ORDEM das linhas, então ela não pode ir para o fim da OS
      select max(i.position) + 1 into v_pos from service_order_items i
       where i.service_order_id = v_os.id and (i.id = v_item or (i.used_in_item_id = v_item and i.kind = 'part'));
      update service_order_items set position = position + 1 where service_order_id = v_os.id and position >= v_pos;
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
      -- Serviço que ganhou peça deixa de ser "só mão de obra"
      update service_order_items set service_type = 'servico' where id = v_item and service_type is distinct from 'servico';
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

-- Conserta as OS já lançadas assim: peça com used_in_item_id cujo serviço "de cima" (pela ordem) é outro.
-- Reordena as linhas de cada OS afetada: cada serviço seguido das peças dele; peças sem serviço ficam onde estão.
do $$
declare o uuid; r record; p integer;
begin
  for o in
    select distinct i.service_order_id from service_order_items i
     where i.kind = 'part' and i.used_in_item_id is not null
       and i.used_in_item_id is distinct from (
         select l.id from service_order_items l
          where l.service_order_id = i.service_order_id and l.kind = 'labor'
            and (l.position, l.created_at, l.id) < (i.position, i.created_at, i.id)
          order by l.position desc, l.created_at desc, l.id desc limit 1)
       and exists (select 1 from service_orders so where so.id = i.service_order_id and so.source = 'agent_orcamento')
  loop
    p := 0;
    for r in
      select i.id from service_order_items i
        left join service_order_items s on s.id = i.used_in_item_id
       where i.service_order_id = o
       order by coalesce(s.position, i.position), (i.kind = 'part'), i.position, i.created_at
    loop
      update service_order_items set position = p where id = r.id;
      p := p + 1;
    end loop;
    update service_order_items l set service_type = 'servico'
     where l.service_order_id = o and l.kind = 'labor'
       and exists (select 1 from service_order_items x where x.used_in_item_id = l.id and x.kind = 'part');
  end loop;
end $$;
