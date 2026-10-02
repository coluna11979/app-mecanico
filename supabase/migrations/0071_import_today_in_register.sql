-- Nota importada com a data de HOJE e caixa aberto: o recebimento entra no caixa do dia
-- (o dinheiro está na gaveta e precisa bater no fechamento). Notas de outros dias continuam
-- fora do caixa, com a data da nota (retroativo).

create or replace function public.import_receive_os(
  p_workshop uuid, p_session uuid, p_os uuid, p_parts jsonb, p_paid_at timestamptz, p_operator uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _op uuid; _os service_orders; _pay uuid; _reg uuid; _at timestamptz; _tag text;
  _total numeric := 0; _remaining numeric; _part jsonb;
  _method text; _amt numeric; _inst int;
begin
  _op := cash_actor(p_workshop, p_session, 'caixa');

  if p_operator is not null then
    if not exists (select 1 from workshop_operators where id = p_operator and workshop_id = p_workshop) then
      raise exception 'Colaborador não encontrado';
    end if;
    _op := p_operator;
  end if;

  if p_paid_at is null or p_paid_at > now() + interval '1 day' then
    raise exception 'Data do recebimento inválida';
  end if;

  select * into _os from service_orders where id = p_os and workshop_id = p_workshop for update;
  if _os.id is null then raise exception 'OS não encontrada'; end if;
  if _os.source <> 'paper_import' then raise exception 'Só OS importada recebe com data retroativa'; end if;
  if _os.status <> 'completed' then raise exception 'Só serviço feito pode ser recebido'; end if;

  _remaining := round(_os.price - _os.counter_discount - _os.paid_amount, 2);

  if jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) = 0 then
    raise exception 'Informe ao menos uma forma de pagamento';
  end if;

  for _part in select * from jsonb_array_elements(p_parts) loop
    _method := _part->>'method';
    _amt := round((_part->>'amount')::numeric, 2);
    if _method not in ('dinheiro', 'pix', 'debito', 'credito') then
      raise exception 'Forma de pagamento inválida: %', _method;
    end if;
    if _amt is null or _amt <= 0 then raise exception 'Valor inválido na forma %', _method; end if;
    _total := _total + _amt;
  end loop;

  if _total > _remaining + 0.001 then
    raise exception 'O total informado (R$ %) passa do valor da nota (R$ %)', _total, _remaining;
  end if;

  -- Nota de HOJE com caixa aberto: o dinheiro está na gaveta → entra no caixa do dia (conta na conferência).
  -- Nota de outro dia: fica fora do caixa, com a data da nota.
  if (p_paid_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date then
    _reg := cash_open_register(p_workshop);
  end if;
  _at  := case when _reg is not null then now() else p_paid_at end;
  _tag := case when _reg is not null then '' else ' (nota importada)' end;

  insert into os_payments (workshop_id, register_id, retroactive, service_order_id, amount, discount, operator_id, created_at)
  values (p_workshop, _reg, _reg is null, p_os, _total, 0, _op, _at)
  returning id into _pay;

  for _part in select * from jsonb_array_elements(p_parts) loop
    _method := _part->>'method';
    _amt := round((_part->>'amount')::numeric, 2);
    _inst := case when _method = 'credito' then greatest(1, least(24, coalesce((_part->>'installments')::int, 1))) else 1 end;
    insert into cash_entries (workshop_id, register_id, retroactive, kind, method, amount, installments, description,
                              payment_id, operator_id, role, created_at)
    values (p_workshop, _reg, _reg is null, 'recebimento', _method, _amt, _inst,
            'OS nº ' || coalesce(lpad(_os.number::text, 4, '0'), left(_os.id::text, 8)) || _tag,
            _pay, _op, cash_session_role(p_session), _at);
  end loop;

  update service_orders
     set paid_amount = paid_amount + _total,
         paid_at = case when round(price - counter_discount - paid_amount - _total, 2) <= 0 then _at else null end
   where id = p_os;

  return _pay;
end;
$$;

revoke execute on function public.import_receive_os(uuid, uuid, uuid, jsonb, timestamptz, uuid) from public, anon;
grant  execute on function public.import_receive_os(uuid, uuid, uuid, jsonb, timestamptz, uuid) to authenticated;
