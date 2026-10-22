-- Código do fornecedor na peça + juntar peças repetidas.
--  • purchase_post: grava o código do produto da nota (p_items[].code) na peça nova e completa
--    a peça existente que ainda não tem código. Assim a próxima nota do mesmo produto cai na
--    mesma peça (a tela reconhece pelo código), mesmo com a descrição escrita diferente.
--  • part_merge: junta duas peças da mesma oficina. Tudo o que aponta para a peça repetida
--    (itens de OS, itens de nota, movimentos de estoque, check-up, carros compatíveis) passa
--    para a que fica; o estoque é somado; a repetida sai do cadastro.
--  • Peças que entraram por nota com o código grudado no nome ("10190 SILENCIOSO…")
--    ganham o código na coluna certa.

create or replace function public.purchase_post(
  p_workshop uuid, p_supplier uuid, p_number text, p_issue_date date,
  p_freight numeric, p_discount numeric, p_items jsonb, p_installments jsonb, p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _inv uuid; _it jsonb; _part uuid; _qty numeric; _cost numeric; _prev numeric; _name text; _code text;
  _items_total numeric := 0; _total numeric; _inst_total numeric := 0; _n int; _i int := 0; _supplier_name text;
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

  for _it in select * from jsonb_array_elements(p_installments) loop
    if (_it->>'due_date') is null or coalesce((_it->>'amount')::numeric, 0) <= 0 then raise exception 'Parcela inválida'; end if;
    _inst_total := _inst_total + round((_it->>'amount')::numeric, 2);
  end loop;
  if abs(_inst_total - _total) > 0.01 then
    raise exception 'As parcelas somam R$ % e a nota dá R$ %', _inst_total, _total;
  end if;

  insert into purchase_invoices (workshop_id, supplier_id, number, issue_date, freight, discount, total, notes)
  values (p_workshop, p_supplier, nullif(trim(p_number), ''), coalesce(p_issue_date, current_date),
          p_freight, p_discount, _total, nullif(trim(p_notes), ''))
  returning id into _inv;

  for _it in select * from jsonb_array_elements(p_items) loop
    _qty := round((_it->>'quantity')::numeric, 3); _cost := round((_it->>'unit_cost')::numeric, 2);
    _part := nullif(_it->>'part_id', '')::uuid;
    _code := nullif(trim(coalesce(_it->>'code', '')), '');
    if _part is null then
      _name := trim(coalesce(_it->>'name', ''));
      if _name = '' then raise exception 'Informe o nome da peça nova'; end if;
      insert into workshop_parts (workshop_id, name, code, unit, cost, supplier_id)
      values (p_workshop, _name, _code, coalesce(nullif(_it->>'unit', ''), 'un'), _cost, p_supplier)
      returning id, 0 into _part, _prev;
    else
      select cost, name into _prev, _name from workshop_parts where id = _part and workshop_id = p_workshop for update;
      if _name is null then raise exception 'Peça não encontrada'; end if;
    end if;

    insert into purchase_items (invoice_id, workshop_id, part_id, description, quantity, unit_cost, prev_cost)
    values (_inv, p_workshop, _part, _name, _qty, _cost, _prev);
    update workshop_parts
       set stock_qty = stock_qty + _qty, cost = _cost, supplier_id = coalesce(supplier_id, p_supplier),
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
$$;

-- ── Juntar peças ────────────────────────────────────────────────────────────
create or replace function public.part_merge(p_keep uuid, p_remove uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare _k workshop_parts; _r workshop_parts;
begin
  if p_keep = p_remove then raise exception 'Escolha outra peça'; end if;
  select * into _k from workshop_parts where id = p_keep for update;
  select * into _r from workshop_parts where id = p_remove for update;
  if _k.id is null or _r.id is null then raise exception 'Peça não encontrada'; end if;
  if _k.workshop_id <> _r.workshop_id then raise exception 'As peças são de lojas diferentes'; end if;
  if not is_workshop_member(_k.workshop_id, auth.uid()) then raise exception 'Sem acesso a esta oficina'; end if;

  update service_order_items   set part_id = p_keep       where part_id = p_remove;
  update purchase_items        set part_id = p_keep       where part_id = p_remove;
  update stock_movements       set part_id = p_keep       where part_id = p_remove;
  update checkup_items         set quote_part_id = p_keep where quote_part_id = p_remove;
  update workshop_part_vehicles set part_id = p_keep      where part_id = p_remove;

  update workshop_parts
     set stock_qty   = stock_qty + _r.stock_qty,
         code        = coalesce(code, _r.code),
         brand       = coalesce(brand, _r.brand),
         supplier_id = coalesce(supplier_id, _r.supplier_id),
         min_qty     = greatest(min_qty, _r.min_qty),
         active      = true
   where id = p_keep;

  delete from workshop_parts where id = p_remove;
end;
$$;

revoke all on function public.part_merge(uuid, uuid) from public, anon;
grant execute on function public.part_merge(uuid, uuid) to authenticated;

-- ── Código grudado no nome (peças que vieram de nota de compra) ─────────────
update public.workshop_parts p
   set code = substring(p.name from '^(\d{4,})\s'),
       name = trim(regexp_replace(p.name, '^\d{4,}\s+', ''))
 where p.code is null
   and p.name ~ '^\d{4,}\s+\S'
   and exists (select 1 from public.purchase_items pi where pi.part_id = p.id);
