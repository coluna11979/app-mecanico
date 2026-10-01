-- Venda de peças no balcão (óleo, palheta, lâmpada…): sem serviço, sem mecânico.
-- Vira uma OS concluída só com peças (source = 'balcao') e já recebida no caixa aberto:
--   • entra no faturamento → base da % do gerente (ex.: 1,5%)
--   • peça sem serviço não gera comissão de mecânico (os_commission_base)
--   • baixa o estoque das peças do catálogo (trg_os_stock, ao concluir)
-- Tudo numa transação: ou registra a venda inteira, ou nada.

-- p_items: [{ "part_id": "…" | null, "description": "Óleo 5W30", "quantity": 4, "unit_price": 45 }]
-- p_parts: formas de pagamento, igual ao cash_receive_os
create or replace function public.cash_counter_sale(
  p_workshop uuid, p_session uuid, p_items jsonb, p_parts jsonb,
  p_customer uuid default null, p_discount numeric default 0, p_cash_given numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _os uuid; _it jsonb; _pos int := 0; _part workshop_parts; _qty numeric; _price numeric; _desc text;
begin
  perform cash_actor(p_workshop, p_session, 'caixa');
  if cash_open_register(p_workshop) is null then raise exception 'Abra o caixa antes de vender'; end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione ao menos uma peça';
  end if;
  if p_customer is not null and not exists (select 1 from customers where id = p_customer and workshop_id = p_workshop) then
    raise exception 'Cliente não encontrado';
  end if;

  insert into service_orders (workshop_id, customer_id, title, status, source, price)
  values (p_workshop, p_customer, 'Venda de balcão', 'open', 'balcao', 0)
  returning id into _os;

  for _it in select * from jsonb_array_elements(p_items) loop
    _part := null;
    if nullif(_it->>'part_id', '') is not null then
      select * into _part from workshop_parts where id = (_it->>'part_id')::uuid and workshop_id = p_workshop;
      if _part.id is null then raise exception 'Peça não encontrada no catálogo'; end if;
    end if;
    _qty   := (_it->>'quantity')::numeric;
    _price := round((_it->>'unit_price')::numeric, 2);
    _desc  := coalesce(nullif(trim(_it->>'description'), ''), _part.name);
    if _desc is null then raise exception 'Informe a descrição da peça'; end if;
    if _qty is null or _qty <= 0 then raise exception 'Quantidade inválida em %', _desc; end if;
    if _price is null or _price < 0 then raise exception 'Preço inválido em %', _desc; end if;

    insert into service_order_items (service_order_id, workshop_id, kind, description, quantity, unit_price, unit_cost, part_id, position)
    values (_os, p_workshop, 'part', _desc, _qty, _price, _part.cost, _part.id, _pos);
    _pos := _pos + 1;
  end loop;

  -- Concluir dispara a baixa de estoque; o total já foi recalculado pelos itens
  update service_orders set status = 'completed', started_at = now(), completed_at = now() where id = _os;

  perform cash_receive_os(p_workshop, p_session, _os, p_parts, p_discount, p_cash_given);
  return _os;
end;
$$;

revoke execute on function public.cash_counter_sale(uuid, uuid, jsonb, jsonb, uuid, numeric, numeric) from public, anon;
grant  execute on function public.cash_counter_sale(uuid, uuid, jsonb, jsonb, uuid, numeric, numeric) to authenticated;
