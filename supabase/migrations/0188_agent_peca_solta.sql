-- Orçamentista: corrigir PEÇA SOLTA da OS (peça com preço próprio, fora de qualquer serviço — ex.: coxim de R$ 980,
-- bomba de R$ 420, polia de R$ 130). Regra do dono: na OS toda peça fica dentro de um serviço, só com custo; venda de
-- peça é pelo Caixa. Pneu é a exceção (pode ter preço próprio para aparecer na nota do cliente).
--   acao 'mover'        → a peça entra no serviço p_item_number (já lançado); o preço dela soma no serviço (o total não muda);
--   acao 'novo_servico' → cria o serviço p_servico_nome (da Tabela) no lugar da peça, com o preço dela (ou p_preco), e a peça dentro.
-- Só OS aberta (concluída: orc_reopen_os antes). Também passa a apontar "peca_solta" na conferência (orc_os_list).

create or replace function public.orc_fix_loose_part(
  p_workshop uuid, p_os_number integer, p_peca text, p_acao text,
  p_item_number integer default null, p_servico_nome text default null, p_preco numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os    service_orders%rowtype;
  v_part  service_order_items%rowtype;
  v_ids   uuid[];
  v_svc   uuid;
  v_sname text;
  v_tab   workshop_services%rowtype;
  v_amt   numeric;
  v_pos   integer;
begin
  if p_acao not in ('mover', 'novo_servico') then return jsonb_build_object('ok', false, 'error', 'acao_invalida'); end if;
  select * into v_os from service_orders where workshop_id = p_workshop and number = p_os_number order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'os_nao_encontrada'); end if;
  if v_os.status in ('completed', 'cancelled') then return jsonb_build_object('ok', false, 'error', 'os_fechada', 'detalhe', 'Reabra com orc_reabrir_os.'); end if;

  -- a peça solta pelo nome
  select array_agg(i.id order by i.position) into v_ids from service_order_items i
   where i.service_order_id = v_os.id and i.kind = 'part' and i.used_in_item_id is null
     and not exists (select 1 from unnest(string_to_array(orc_norm(coalesce(p_peca, '')), ' ')) t
                      where t <> '' and orc_norm(i.description) not like '%' || t || '%');
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'peca_solta_nao_encontrada',
      'pecas_soltas', (select coalesce(jsonb_agg(i.description order by i.position), '[]'::jsonb) from service_order_items i
                        where i.service_order_id = v_os.id and i.kind = 'part' and i.used_in_item_id is null));
  end if;
  if array_length(v_ids, 1) > 1 then
    return jsonb_build_object('ok', false, 'error', 'varias_pecas',
      'opcoes', (select jsonb_agg(i.description order by i.position) from service_order_items i where i.id = any(v_ids)));
  end if;
  select * into v_part from service_order_items where id = v_ids[1];
  if coalesce(v_part.unit_cost, 0) <= 0 then return jsonb_build_object('ok', false, 'error', 'peca_sem_custo', 'peca', v_part.description); end if;
  v_amt := round(v_part.quantity * v_part.unit_price, 2);

  if p_acao = 'mover' then
    select id, description into v_svc, v_sname from (
      select i.id, i.description, row_number() over (order by i.position) n
        from service_order_items i where i.service_order_id = v_os.id and i.kind = 'labor') t where n = p_item_number;
    if v_svc is null then return jsonb_build_object('ok', false, 'error', 'item_nao_encontrado'); end if;
    update service_order_items set unit_price = case when p_preco is not null then p_preco
                                                     else round(unit_price + v_amt / greatest(quantity, 1), 2) end,
                                   service_type = 'servico'
     where id = v_svc;
  else
    select * into v_tab from workshop_services where workshop_id = p_workshop and active and orc_norm(name) = orc_norm(coalesce(p_servico_nome, '')) limit 1;
    if v_tab.id is null then
      return jsonb_build_object('ok', false, 'error', 'servico_fora_da_tabela', 'detalhe', 'Use um serviço da Tabela (orc_buscar_servico); se faltar, o dono cadastra em Serviços.');
    end if;
    if coalesce(p_preco, v_amt) <= 0 then return jsonb_build_object('ok', false, 'error', 'preco_necessario'); end if;
    v_svc := gen_random_uuid();
    v_sname := v_tab.name;
    -- o serviço entra onde a peça estava
    update service_order_items set position = position + 1 where service_order_id = v_os.id and position >= v_part.position;
    insert into service_order_items (id, service_order_id, workshop_id, kind, description, quantity, unit_price, position, service_type, standalone, workshop_mechanic_id, executor)
    values (v_svc, v_os.id, p_workshop, 'labor', v_tab.name, 1, coalesce(p_preco, v_amt), v_part.position, 'servico', false,
            v_part.workshop_mechanic_id, v_part.executor);
  end if;

  -- a peça vira "peça do serviço": só custo, logo abaixo dele
  select max(i.position) + 1 into v_pos from service_order_items i
   where i.service_order_id = v_os.id and i.id <> v_part.id and (i.id = v_svc or (i.used_in_item_id = v_svc and i.kind = 'part'));
  update service_order_items set position = position + 1 where service_order_id = v_os.id and position >= v_pos and id <> v_part.id;
  update service_order_items set used_in_item_id = v_svc, standalone = false, unit_price = 0, position = v_pos,
         workshop_mechanic_id = null, executor = null
   where id = v_part.id;

  return jsonb_build_object('ok', true, 'acao', p_acao, 'peca', v_part.description, 'servico', v_sname,
    'total_os', (select price from service_orders where id = v_os.id),
    'servicos', (select coalesce(jsonb_agg(jsonb_build_object('n', t.n, 'servico', t.description, 'preco', round(t.quantity * t.unit_price, 2),
        'pecas', (select coalesce(jsonb_agg(jsonb_build_object('nome', p.description, 'qtd', p.quantity, 'custo', p.unit_cost) order by p.position), '[]'::jsonb)
                    from service_order_items p where p.used_in_item_id = t.id and p.kind = 'part')) order by t.n), '[]'::jsonb)
                 from (select i.*, row_number() over (order by i.position) n from service_order_items i where i.service_order_id = v_os.id and i.kind = 'labor') t));
end $$;
revoke all on function public.orc_fix_loose_part(uuid, integer, text, text, integer, text, numeric) from public, anon, authenticated;
grant execute on function public.orc_fix_loose_part(uuid, integer, text, text, integer, text, numeric) to service_role;

update ai_agents set tools = array_append(tools, 'orc_corrigir_peca_solta')
 where template = 'orcamento' and not ('orc_corrigir_peca_solta' = any (tools));

-- Conferência: peça solta (fora de serviço, sem ser pneu) vira problema "peca_solta"
create or replace function public.orc_os_list(
  p_workshop uuid, p_from date default null, p_to date default null, p_status text default null,
  p_so_com_problema boolean default false, p_limit integer default 30
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from date := coalesce(p_from, (now() at time zone 'America/Sao_Paulo')::date);
  v_to   date := coalesce(p_to, v_from);
  v_lim  integer := least(greatest(coalesce(p_limit, 30), 1), 60);
  v_rows jsonb;
begin
  if v_to < v_from then return jsonb_build_object('ok', false, 'error', 'periodo_invalido'); end if;
  if v_to - v_from > 62 then return jsonb_build_object('ok', false, 'error', 'periodo_maximo_62_dias'); end if;
  if p_status is not null and p_status not in ('abertas', 'concluidas', 'canceladas', 'todas') then
    return jsonb_build_object('ok', false, 'error', 'status_invalido', 'validos', jsonb_build_array('abertas', 'concluidas', 'canceladas', 'todas'));
  end if;

  with os as (
    select so.*
      from service_orders so
     where so.workshop_id = p_workshop
       and (so.created_at at time zone 'America/Sao_Paulo')::date between v_from and v_to
       and coalesce(so.source, '') not in ('balcao', 'paper_import', 'demo')
       and (coalesce(p_status, 'todas') = 'todas'
            or (p_status = 'abertas' and so.status in ('open', 'awaiting_approval', 'approved', 'in_progress'))
            or (p_status = 'concluidas' and so.status = 'completed')
            or (p_status = 'canceladas' and so.status = 'cancelled'))
  ),
  it as (
    select i.*, o.number os_number,
           wp.category part_cat, wp.id is not null in_catalog,
           svc.category svc_cat, svc.id is not null in_table,
           parent.description parent_desc, psvc.category parent_cat
      from os o
      join service_order_items i on i.service_order_id = o.id
      left join workshop_parts wp on wp.id = i.part_id
      left join lateral (select s.id, s.category from workshop_services s
                          where s.workshop_id = p_workshop and orc_norm(s.name) = orc_norm(i.description) limit 1) svc on i.kind = 'labor'
      left join service_order_items parent on parent.id = i.used_in_item_id
      left join lateral (select s.category from workshop_services s
                          where s.workshop_id = p_workshop and orc_norm(s.name) = orc_norm(parent.description) limit 1) psvc on parent.id is not null
  ),
  prob as (
    select it.service_order_id, jsonb_build_object('item', it.description, 'problema', p.code) || coalesce(p.extra, '{}'::jsonb) j
      from it
      cross join lateral (values
        (case when it.kind = 'labor' and it.workshop_mechanic_id is null and coalesce(it.executor, '') <> 'platform' then 'servico_sem_responsavel' end, null::jsonb),
        (case when it.kind = 'labor' and not it.in_table then 'servico_fora_da_tabela' end, null),
        (case when it.kind = 'part' and coalesce(it.unit_cost, 0) <= 0 then 'peca_sem_custo' end, null),
        (case when it.kind = 'part' and not it.in_catalog then 'peca_fora_do_cadastro' end, null),
        (case when it.kind = 'part' and it.part_cat is not null and orc_part_cats_for_service(it.parent_cat) is not null
                   and not (it.part_cat = any (orc_part_cats_for_service(it.parent_cat))) then 'peca_de_outra_familia' end,
         jsonb_build_object('categoria_peca', it.part_cat, 'servico', it.parent_desc, 'categoria_servico', it.parent_cat)),
        (case when it.kind = 'part' and it.used_in_item_id is null and it.unit_price > 0 and coalesce(it.unit_cost, 0) > it.unit_price
              then 'peca_vendida_abaixo_do_custo' end, jsonb_build_object('preco', it.unit_price, 'custo', it.unit_cost)),
        (case when it.kind = 'part' and it.used_in_item_id is null and coalesce(it.part_cat, '') <> 'rodas'
                   and orc_norm(it.description) !~ '(pneu|camara de ar|[0-9]{3}/[0-9]{2})'
              then 'peca_solta' end, jsonb_build_object('preco', it.unit_price)),
        (case when it.kind = 'labor' and orc_norm(coalesce(it.svc_cat, it.description)) like '%oleo%'
                   and not exists (select 1 from service_order_items x left join workshop_parts xp on xp.id = x.part_id
                                    where x.service_order_id = it.service_order_id and x.kind = 'part'
                                      and orc_norm(x.description || ' ' || coalesce(xp.name, '')) ~ '(oleo|lubrax|mobil|castrol|shell|selenia|magnatec|elaion|havoline|motul|ipiranga|5w|10w|15w|0w)')
              then 'troca_de_oleo_sem_oleo' end, null)
      ) p(code, extra)
     where p.code is not null
    union all
    select it.service_order_id, jsonb_build_object('item', it.description, 'problema', 'servico_repetido', 'vezes', count(*))
      from it where it.kind = 'labor'
     group by it.service_order_id, orc_norm(it.description), it.description
    having count(*) > 1
  )
  select coalesce(jsonb_agg(x order by x->>'criada'), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
          'os_numero', o.number,
          'status', o.status,
          'criada', to_char(o.created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
          'cliente', c.full_name,
          'carro', nullif(btrim(concat_ws(' ', v.make, v.model, v.year::text, v.plate)), ''),
          'total', o.price,
          'em_aberto', round(o.price - o.counter_discount - o.paid_amount, 2),
          'itens', (select coalesce(jsonb_agg(jsonb_build_object(
                        'tipo', case when i.kind = 'labor' then 'servico' else 'peca' end,
                        'nome', i.description, 'qtd', i.quantity, 'preco', i.unit_price, 'custo', i.unit_cost,
                        'categoria', coalesce(i.svc_cat, i.part_cat), 'dentro_de', i.parent_desc) order by i.position, i.created_at), '[]'::jsonb)
                      from it i where i.service_order_id = o.id),
          'problemas', (select coalesce(jsonb_agg(p.j), '[]'::jsonb) from prob p where p.service_order_id = o.id)
        ) x
        from os o
        left join customers c on c.id = o.customer_id
        left join vehicles v on v.id = o.vehicle_id
       order by o.created_at
       limit v_lim
    ) t
   where not coalesce(p_so_com_problema, false) or jsonb_array_length(x->'problemas') > 0;

  return jsonb_build_object('ok', true, 'de', v_from, 'ate', v_to, 'quantidade', jsonb_array_length(v_rows),
    'com_problema', (select count(*) from jsonb_array_elements(v_rows) e where jsonb_array_length(e->'problemas') > 0),
    'os', v_rows);
end $$;
