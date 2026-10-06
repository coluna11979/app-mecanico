-- Receber uma OS com data de pagamento ANTERIOR a hoje (ex.: fiado de nota antiga que o cliente já quitou).
-- Entra com aquela data e fora do caixa aberto (o dinheiro não está na gaveta de hoje),
-- conta no Financeiro / Recebimentos do dia em que foi pago. Pagamento de hoje continua no cash_receive_os.

create or replace function public.cash_receive_os_past(
  p_workshop uuid, p_session uuid, p_os uuid, p_parts jsonb, p_paid_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _op uuid; _os service_orders; _pay uuid;
  _total numeric := 0; _remaining numeric; _part jsonb;
  _method text; _amt numeric; _inst int;
begin
  _op := cash_actor(p_workshop, p_session, 'caixa');

  if p_paid_at is null or (p_paid_at at time zone 'America/Sao_Paulo')::date >= (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Use esta opção só para pagamento de dia anterior a hoje';
  end if;

  select * into _os from service_orders where id = p_os and workshop_id = p_workshop for update;
  if _os.id is null then raise exception 'OS não encontrada'; end if;
  if _os.status = 'cancelled' then raise exception 'OS cancelada não pode ser recebida'; end if;

  _remaining := round(_os.price - _os.counter_discount - _os.paid_amount, 2);

  if jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) = 0 then
    raise exception 'Informe ao menos uma forma de pagamento';
  end if;
  for _part in select * from jsonb_array_elements(p_parts) loop
    _method := _part->>'method';
    _amt := round((_part->>'amount')::numeric, 2);
    if _method not in ('dinheiro', 'pix', 'debito', 'credito') then raise exception 'Forma de pagamento inválida: %', _method; end if;
    if _amt is null or _amt <= 0 then raise exception 'Valor inválido na forma %', _method; end if;
    _total := _total + _amt;
  end loop;
  if _total > _remaining + 0.001 then
    raise exception 'O total informado (R$ %) passa do valor em aberto (R$ %)', _total, _remaining;
  end if;

  insert into os_payments (workshop_id, register_id, retroactive, service_order_id, amount, discount, operator_id, created_at)
  values (p_workshop, null, true, p_os, _total, 0, _op, p_paid_at)
  returning id into _pay;

  for _part in select * from jsonb_array_elements(p_parts) loop
    _method := _part->>'method';
    _amt := round((_part->>'amount')::numeric, 2);
    _inst := case when _method = 'credito' then greatest(1, least(24, coalesce((_part->>'installments')::int, 1))) else 1 end;
    insert into cash_entries (workshop_id, register_id, retroactive, kind, method, amount, installments, description,
                              payment_id, operator_id, role, created_at)
    values (p_workshop, null, true, 'recebimento', _method, _amt, _inst,
            'OS nº ' || coalesce(lpad(_os.number::text, 4, '0'), left(_os.id::text, 8)) || ' (pago em ' || to_char(p_paid_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || ')',
            _pay, _op, cash_session_role(p_session), p_paid_at);
  end loop;

  update service_orders
     set paid_amount = paid_amount + _total,
         paid_at = case when round(price - counter_discount - paid_amount - _total, 2) <= 0 then p_paid_at else null end
   where id = p_os;

  return _pay;
end;
$$;

revoke execute on function public.cash_receive_os_past(uuid, uuid, uuid, jsonb, timestamptz) from public, anon;
grant  execute on function public.cash_receive_os_past(uuid, uuid, uuid, jsonb, timestamptz) to authenticated;
