-- Corrigir pagamento em QUALQUER OS paga, inclusive de caixa já fechado, sem mudar o status da OS.
-- O fechamento daquele caixa fica como foi conferido (é um retrato do dia); o Financeiro e os
-- relatórios passam a contar a forma nova. As partes antigas continuam estornadas ("Pagamento corrigido").

create or replace function public.cash_fix_payment(
  p_workshop uuid, p_session uuid, p_payment uuid, p_parts jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _op uuid; _pay os_payments; _os service_orders; _old record; _part jsonb;
  _total numeric := 0; _cash numeric := 0; _cap numeric; _method text; _amt numeric; _inst int;
begin
  _op := cash_actor(p_workshop, p_session, 'cancelar_recebimento');

  select * into _pay from os_payments where id = p_payment and workshop_id = p_workshop for update;
  if _pay.id is null or _pay.cancelled_at is not null then raise exception 'Pagamento não encontrado'; end if;

  select * into _os from service_orders where id = _pay.service_order_id for update;

  if jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) = 0 then
    raise exception 'Informe ao menos uma forma de pagamento';
  end if;
  for _part in select * from jsonb_array_elements(p_parts) loop
    _method := _part->>'method';
    _amt := round((_part->>'amount')::numeric, 2);
    if _method not in ('dinheiro', 'pix', 'debito', 'credito') then raise exception 'Forma de pagamento inválida: %', _method; end if;
    if _amt is null or _amt <= 0 then raise exception 'Valor inválido na forma %', _method; end if;
    _total := _total + _amt;
    if _method = 'dinheiro' then _cash := _cash + _amt; end if;
  end loop;

  -- Cabe na OS: o que ela vale menos o que já foi pago por outros recebimentos
  _cap := round(_os.price - _os.counter_discount - (_os.paid_amount - _pay.amount), 2);
  if _total > _cap + 0.001 then
    raise exception 'O total (R$ %) passa do valor da OS em aberto para este pagamento (R$ %)', _total, _cap;
  end if;

  -- Uma linha das antigas, só para copiar descrição e função de quem recebeu
  select description, role into _old from cash_entries where payment_id = p_payment and cancelled_at is null limit 1;

  update cash_entries set cancelled_at = now(), cancelled_by = _op, cancel_reason = 'Pagamento corrigido'
   where payment_id = p_payment and cancelled_at is null;

  for _part in select * from jsonb_array_elements(p_parts) loop
    _method := _part->>'method';
    _amt := round((_part->>'amount')::numeric, 2);
    _inst := case when _method = 'credito' then greatest(1, least(24, coalesce((_part->>'installments')::int, 1))) else 1 end;
    insert into cash_entries (workshop_id, register_id, retroactive, kind, method, amount, installments, description,
                              payment_id, operator_id, role, created_at)
    values (p_workshop, _pay.register_id, _pay.retroactive, 'recebimento', _method, _amt, _inst,
            coalesce(_old.description, 'OS nº ' || coalesce(lpad(_os.number::text, 4, '0'), left(_os.id::text, 8))),
            p_payment, _pay.operator_id, _old.role, _pay.created_at);
  end loop;

  update os_payments
     set amount = _total,
         change_given = case when _cash > 0 then change_given else 0 end
   where id = p_payment;

  update service_orders
     set paid_amount = paid_amount - _pay.amount + _total,
         paid_at = case when round(price - counter_discount - (paid_amount - _pay.amount + _total), 2) <= 0
                        then coalesce(paid_at, _pay.created_at) else null end
   where id = _os.id;
end;
$$;

revoke execute on function public.cash_fix_payment(uuid, uuid, uuid, jsonb) from public, anon;
grant  execute on function public.cash_fix_payment(uuid, uuid, uuid, jsonb) to authenticated;
