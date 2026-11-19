-- Orçamentista: ler as NOTAS DE COMPRA (entrada de peças) e o HISTÓRICO DE ESTOQUE de uma peça, já apontando erros.
--  · orc_notes_list: notas por período, fornecedor ou número, com itens (custo da nota e custo real depois do desconto
--    da nota, rateado), contas a pagar e problemas:
--      nota_repetida (mesmo fornecedor + número lançado mais de uma vez → estoque e contas a pagar em dobro),
--      desconto_fora_do_custo (desconto na nota, mas a peça ficou com o custo cheio),
--      itens_diferente_da_conta (soma dos itens − desconto + frete ≠ contas a pagar),
--      custo_da_peca_diferente (custo atual no cadastro ≠ custo real da nota mais recente da peça).
--  · orc_part_history: entradas e saídas de estoque de uma peça (nota, OS, ajuste), com saldo.
-- Só leitura. Notas canceladas aparecem marcadas.

create or replace function public.orc_notes_list(
  p_workshop uuid, p_from date default null, p_to date default null, p_busca text default null,
  p_numero text default null, p_so_com_problema boolean default false, p_limit integer default 20
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_to   date := coalesce(p_to, (now() at time zone 'America/Sao_Paulo')::date);
  v_from date := coalesce(p_from, v_to - 7);
  v_lim  integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_rows jsonb;
begin
  if v_to < v_from then return jsonb_build_object('ok', false, 'error', 'periodo_invalido'); end if;
  if v_to - v_from > 92 and p_numero is null then return jsonb_build_object('ok', false, 'error', 'periodo_maximo_92_dias'); end if;

  with inv as (
    select pi.*, s.name supplier_name,
           (select coalesce(sum(it.quantity * it.unit_cost), 0) from purchase_items it where it.invoice_id = pi.id) items_sum,
           (select coalesce(sum(p.amount), 0) from payables p where p.invoice_id = pi.id and p.cancelled_at is null) pay_sum,
           (select count(*) from purchase_invoices o where o.workshop_id = pi.workshop_id and o.id <> pi.id and o.cancelled_at is null
              and o.supplier_id is not distinct from pi.supplier_id and btrim(o.number) = btrim(pi.number) and coalesce(btrim(pi.number), '') <> '') dup
      from purchase_invoices pi
      left join suppliers s on s.id = pi.supplier_id
     where pi.workshop_id = p_workshop
       and (p_numero is not null and btrim(pi.number) = btrim(p_numero)
            or p_numero is null and coalesce(pi.issue_date, (pi.created_at at time zone 'America/Sao_Paulo')::date) between v_from and v_to)
       and (p_busca is null or orc_norm(coalesce(s.name, '')) like '%' || orc_norm(p_busca) || '%'
            or exists (select 1 from purchase_items it where it.invoice_id = pi.id and orc_norm(it.description) like '%' || orc_norm(p_busca) || '%'))
  ),
  rows as (
    select i.*,
      (case when i.items_sum > 0 then greatest(i.items_sum - coalesce(i.discount, 0), 0) / i.items_sum else 1 end) fator,
      (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
         select 'nota_repetida' problema, jsonb_build_object('vezes', i.dup + 1) extra where i.dup > 0
         union all select 'desconto_fora_do_custo', jsonb_build_object('desconto', i.discount)
          where coalesce(i.discount, 0) > 0.009
            and exists (select 1 from purchase_items it join workshop_parts wp on wp.id = it.part_id
                         where it.invoice_id = i.id and abs(wp.cost - it.unit_cost) < 0.005)
         union all select 'itens_diferente_da_conta', jsonb_build_object('itens_menos_desconto_mais_frete', round(i.items_sum - coalesce(i.discount, 0) + coalesce(i.freight, 0), 2), 'contas_a_pagar', i.pay_sum)
          where i.cancelled_at is null and i.pay_sum > 0 and abs(i.items_sum - coalesce(i.discount, 0) + coalesce(i.freight, 0) - i.pay_sum) > 0.05
       ) x) probs
    from inv i
  )
  select coalesce(jsonb_agg(j order by j->>'data' desc, j->>'numero'), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
          'nota_id_curto', left(r.id::text, 8),
          'fornecedor', r.supplier_name, 'numero', r.number,
          'data', coalesce(r.issue_date, (r.created_at at time zone 'America/Sao_Paulo')::date),
          'lancada_em', to_char(r.created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
          'cancelada', r.cancelled_at is not null,
          'soma_itens', round(r.items_sum, 2), 'desconto', r.discount, 'frete', r.freight, 'total', r.total,
          'contas_a_pagar', (select coalesce(jsonb_agg(jsonb_build_object('valor', p.amount, 'vence', p.due_date, 'pago', p.paid_at is not null) order by p.due_date), '[]'::jsonb)
                               from payables p where p.invoice_id = r.id and p.cancelled_at is null),
          'itens', (select coalesce(jsonb_agg(jsonb_build_object(
                        'peca', it.description, 'qtd', it.quantity, 'custo_na_nota', it.unit_cost,
                        'custo_real', round(it.unit_cost * r.fator, 2),
                        'custo_no_cadastro', wp.cost, 'categoria', wp.category,
                        'usada_em_os', (select coalesce(jsonb_agg(distinct so.number), '[]'::jsonb) from service_order_items oi
                                          join service_orders so on so.id = oi.service_order_id where oi.part_id = it.part_id
                                           and oi.created_at >= r.created_at - interval '1 day')) order by it.description), '[]'::jsonb)
                      from purchase_items it left join workshop_parts wp on wp.id = it.part_id where it.invoice_id = r.id),
          'problemas', r.probs) j
        from rows r
       where not coalesce(p_so_com_problema, false) or jsonb_array_length(r.probs) > 0
       order by r.created_at desc
       limit v_lim
    ) t;

  return jsonb_build_object('ok', true, 'de', v_from, 'ate', v_to, 'quantidade', jsonb_array_length(v_rows),
    'com_problema', (select count(*) from jsonb_array_elements(v_rows) e where jsonb_array_length(e->'problemas') > 0),
    'notas', v_rows);
end $$;
revoke all on function public.orc_notes_list(uuid, date, date, text, text, boolean, integer) from public, anon, authenticated;
grant execute on function public.orc_notes_list(uuid, date, date, text, text, boolean, integer) to service_role;

create or replace function public.orc_part_history(p_workshop uuid, p_peca text, p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  p workshop_parts%rowtype;
begin
  select array_agg(x.id order by x.name) into v_ids from workshop_parts x
   where x.workshop_id = p_workshop and x.active
     and not exists (select 1 from unnest(string_to_array(orc_norm(coalesce(p_peca, '')), ' ')) t
                      where t <> '' and orc_norm(x.name || ' ' || coalesce(x.brand, '') || ' ' || coalesce(x.code, '')) not like '%' || t || '%');
  if coalesce(array_length(v_ids, 1), 0) = 0 then return jsonb_build_object('ok', false, 'error', 'peca_nao_encontrada'); end if;
  if array_length(v_ids, 1) > 1 then
    return jsonb_build_object('ok', false, 'error', 'varias_pecas',
      'opcoes', (select jsonb_agg(jsonb_build_object('nome', x.name, 'codigo', x.code, 'estoque', x.stock_qty)) from (select * from workshop_parts where id = any(v_ids) order by name limit 8) x));
  end if;
  select * into p from workshop_parts where id = v_ids[1];
  return jsonb_build_object('ok', true, 'peca', p.name, 'codigo', p.code, 'categoria', p.category, 'custo', p.cost, 'estoque_atual', p.stock_qty,
    'movimentos', (select coalesce(jsonb_agg(jsonb_build_object(
        'quando', to_char(m.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YY HH24:MI'),
        'tipo', case m.kind when 'compra' then 'entrada por nota' when 'estorno_compra' then 'nota cancelada'
                            when 'os' then 'saída na OS' when 'estorno_os' then 'OS reaberta/cancelada' else 'ajuste de estoque' end,
        'qtd', m.qty, 'detalhe', m.note,
        'os', (select so.number from service_orders so where so.id = m.service_order_id)) order by m.created_at desc), '[]'::jsonb)
      from (select * from stock_movements where part_id = p.id order by created_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100)) m));
end $$;
revoke all on function public.orc_part_history(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.orc_part_history(uuid, text, integer) to service_role;

update ai_agents set tools = array_append(tools, 'orc_listar_notas')
 where template = 'orcamento' and not ('orc_listar_notas' = any (tools));
update ai_agents set tools = array_append(tools, 'orc_historico_peca')
 where template = 'orcamento' and not ('orc_historico_peca' = any (tools));
