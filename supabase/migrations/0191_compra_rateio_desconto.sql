-- Entrada de nota: o DESCONTO e o FRETE da nota passam a entrar no custo de cada peça, rateados pelo valor dos itens.
-- Antes o desconto ficava só no total e nas contas a pagar, e a peça entrava com o custo cheio (ex.: Jota Car,
-- nota 170514: coxim R$ 1.021,82 na nota, desconto R$ 396,82, pago R$ 625 → a peça ficou com custo R$ 1.021,82).
--  · purchase_items.note_cost = custo unitário como está na nota (depois do acordo com o fornecedor);
--    purchase_items.unit_cost = custo real (com o desconto/frete da nota rateados) — é o que vai para o cadastro da peça.
--  · Trava de lançamento em dobro: a mesma nota (fornecedor + número + total) lançada de novo em menos de 15 minutos
--    é recusada (duplo clique / reenvio). Lançar de novo de propósito continua possível depois do aviso da tela.
--  · orc_notes_list (agente) passa a usar note_cost quando existir (não rateia duas vezes).

alter table public.purchase_items add column if not exists note_cost numeric;
comment on column public.purchase_items.note_cost is 'Custo unitário como na nota; unit_cost = custo real com desconto/frete da nota rateados (0191)';

create or replace function public.purchase_post(p_workshop uuid, p_supplier uuid, p_number text, p_issue_date date, p_freight numeric, p_discount numeric, p_items jsonb, p_installments jsonb, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _inv uuid; _it jsonb; _part uuid; _qty numeric; _cost numeric; _real numeric; _prev numeric; _name text; _code text;
  _items_total numeric := 0; _total numeric; _inst_total numeric := 0; _n int; _i int := 0; _supplier_name text; _factor numeric := 1;
begin
  if not is_workshop_member(p_workshop, auth.uid()) then raise exception 'Sem acesso a esta oficina'; end if;
  select name into _supplier_name from suppliers where id = p_supplier and workshop_id = p_workshop;
  if _supplier_name is null then raise exception 'Fornecedor não encontrado'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Adicione ao menos uma peça'; end if;
  if jsonb_typeof(p_installments) <> 'array' or jsonb_array_length(p_installments) = 0 then raise exception 'Informe o pagamento'; end if;
  p_freight := coalesce(p_freight, 0); p_discount := coalesce(p_discount, 0);
  if p_freight < 0 or p_discount < 0 then raise exception 'Frete ou desconto inválido'; end if;

  for _it in select * from jsonb_array_elements(p_items) loop
    _qty := (_it->>'quantity')::numeric; _cost := (_it->>'unit_cost')::numeric;
    if _qty is null or _qty <= 0 then raise exception 'Quantidade inválida'; end if;
    if _cost is null or _cost < 0 then raise exception 'Custo inválido'; end if;
    _items_total := _items_total + _qty * _cost;
  end loop;
  _total := round(_items_total + p_freight - p_discount, 2);
  if _total < 0 then raise exception 'Desconto maior que o valor da nota'; end if;
  -- Rateio: cada peça recebe a mesma proporção do desconto/frete da nota
  if _items_total > 0 then _factor := _total / _items_total; end if;

  for _it in select * from jsonb_array_elements(p_installments) loop
    if (_it->>'due_date') is null or coalesce((_it->>'amount')::numeric, 0) <= 0 then raise exception 'Parcela inválida'; end if;
    _inst_total := _inst_total + round((_it->>'amount')::numeric, 2);
  end loop;
  if abs(_inst_total - _total) > 0.01 then
    raise exception 'As parcelas somam R$ % e a nota dá R$ %', _inst_total, _total;
  end if;

  -- Mesma nota lançada de novo agora há pouco (duplo clique, reenvio)
  if exists (select 1 from purchase_invoices o
              where o.workshop_id = p_workshop and o.supplier_id = p_supplier and o.cancelled_at is null
                and coalesce(btrim(o.number), '') = coalesce(btrim(p_number), '') and coalesce(btrim(p_number), '') <> ''
                and abs(o.total - _total) < 0.01 and o.created_at > now() - interval '15 minutes') then
    raise exception 'Esta nota (nº %) acabou de ser lançada. Confira em Compras antes de lançar de novo.', btrim(p_number);
  end if;

  insert into purchase_invoices (workshop_id, supplier_id, number, issue_date, freight, discount, total, notes)
  values (p_workshop, p_supplier, nullif(trim(p_number), ''), coalesce(p_issue_date, current_date),
          p_freight, p_discount, _total, nullif(trim(p_notes), ''))
  returning id into _inv;

  for _it in select * from jsonb_array_elements(p_items) loop
    _qty := round((_it->>'quantity')::numeric, 3); _cost := round((_it->>'unit_cost')::numeric, 2);
    _real := round((_it->>'unit_cost')::numeric * _factor, 2);
    _part := nullif(_it->>'part_id', '')::uuid;
    _code := nullif(trim(coalesce(_it->>'code', '')), '');
    if _part is null then
      _name := trim(coalesce(_it->>'name', ''));
      if _name = '' then raise exception 'Informe o nome da peça nova'; end if;
      insert into workshop_parts (workshop_id, name, code, unit, cost, supplier_id)
      values (p_workshop, _name, _code, coalesce(nullif(_it->>'unit', ''), 'un'), _real, p_supplier)
      returning id, 0 into _part, _prev;
    else
      select cost, name into _prev, _name from workshop_parts where id = _part and workshop_id = p_workshop for update;
      if _name is null then raise exception 'Peça não encontrada'; end if;
    end if;

    insert into purchase_items (invoice_id, workshop_id, part_id, description, quantity, unit_cost, note_cost, prev_cost)
    values (_inv, p_workshop, _part, _name, _qty, _real, _cost, _prev);
    update workshop_parts
       set stock_qty = stock_qty + _qty, cost = _real, supplier_id = coalesce(supplier_id, p_supplier),
           code = coalesce(code, _code)
     where id = _part;
    insert into stock_movements (workshop_id, part_id, qty, kind, invoice_id, note)
    values (p_workshop, _part, _qty, 'compra', _inv, 'Nota ' || coalesce(nullif(trim(p_number), ''), 's/ nº') || ' · ' || _supplier_name);
  end loop;

  _n := jsonb_array_length(p_installments);
  for _it in select * from jsonb_array_elements(p_installments) loop
    _i := _i + 1;
    insert into payables (workshop_id, supplier_id, invoice_id, description, category, installment, amount, due_date)
    values (p_workshop, p_supplier, _inv,
            _supplier_name || ' · nota ' || coalesce(nullif(trim(p_number), ''), 's/ nº'),
            'Fornecedor', case when _n > 1 then _i || '/' || _n end,
            round((_it->>'amount')::numeric, 2), (_it->>'due_date')::date);
  end loop;
  return _inv;
end;
$function$;

-- Conferência do agente: nota nova já tem o custo real em unit_cost (note_cost = valor da nota)
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
           (select coalesce(sum(it.quantity * coalesce(it.note_cost, it.unit_cost)), 0) from purchase_items it where it.invoice_id = pi.id) items_sum,
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
                         where it.invoice_id = i.id and it.note_cost is null and abs(wp.cost - it.unit_cost) < 0.005)
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
                        'peca', it.description, 'qtd', it.quantity, 'custo_na_nota', coalesce(it.note_cost, it.unit_cost),
                        'custo_real', case when it.note_cost is not null then it.unit_cost else round(it.unit_cost * r.fator, 2) end,
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
