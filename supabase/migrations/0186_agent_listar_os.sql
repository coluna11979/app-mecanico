-- Orçamentista: LISTAR as OS por período/situação e já apontar o que está fora das regras (auditoria).
-- Regras conferidas por item (as mesmas que o agente segue ao lançar):
--   servico_sem_responsavel, servico_fora_da_tabela (nome que não está na Tabela de serviços, ex.: "Mão de obra"),
--   servico_repetido, peca_sem_custo, peca_fora_do_cadastro, peca_de_outra_familia (categoria da peça não combina
--   com a do serviço), peca_avulsa_com_custo_maior_que_preco (vendida abaixo do custo), troca_de_oleo_sem_oleo.
-- Venda de balcão e importação de notas antigas ficam de fora, a não ser que peça.

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
revoke all on function public.orc_os_list(uuid, date, date, text, boolean, integer) from public, anon, authenticated;
grant execute on function public.orc_os_list(uuid, date, date, text, boolean, integer) to service_role;

update ai_agents set tools = array_append(tools, 'orc_listar_os')
 where template = 'orcamento' and not ('orc_listar_os' = any (tools));
