-- Orçamentista: alterar os itens de uma OS aberta (serviço: nome/preço/remover; peça do serviço: qtd/custo/remover/adicionar).
-- O serviço é identificado pelo NÚMERO dele na OS (1, 2, …, a ordem em que foi lançado), como em orc_set_responsible.
-- OS concluída ou cancelada não muda. Só o service_role executa.

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
      if (p_qtd is not null and p_qtd <= 0) or (p_custo is not null and p_custo < 0) then return jsonb_build_object('ok', false, 'error', 'valor_invalido'); end if;
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
        insert into service_order_items (service_order_id, workshop_id, kind, description, quantity, unit_price, unit_cost, part_id, used_in_item_id, position, standalone)
        values (v_os.id, p_workshop, 'part', v_pp.name, coalesce(p_qtd, 1), 0, coalesce(p_custo, v_pp.cost), v_pp.id, v_item, v_pos, false);
      elsif p_custo is not null and p_custo >= 0 then
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

revoke all on function public.orc_edit_item(uuid, integer, integer, text, text, numeric, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.orc_edit_item(uuid, integer, integer, text, text, numeric, text, numeric, numeric) to service_role;
