-- Editar uma transferência entre lojas: forma de acerto, preço do repasse, vencimento e observação.
-- Não mexe em estoque nem na quantidade (para corrigir quantidade, faça uma transferência de volta).
-- Conta a pagar já paga trava a edição (desfaça o pagamento em Contas a pagar antes).

create or replace function public.stock_transfer_update(
  p_id uuid, p_settlement text, p_unit_price numeric, p_due date default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _t stock_transfers;
  _pay payables;
  _s text := coalesce(p_settlement, 'sem_cobranca');
  _total numeric;
  _new_pay uuid;
  _src_name text;
  _part_name text;
  _unit text;
  _note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into _t from stock_transfers where id = p_id for update;
  if _t.id is null
     or not (is_workshop_member(_t.from_workshop_id, auth.uid()) or is_workshop_member(_t.to_workshop_id, auth.uid())) then
    raise exception 'Transferência não encontrada';
  end if;
  if _s not in ('sem_cobranca', 'conta_corrente', 'conta_a_pagar', 'troca') then raise exception 'Forma de acerto inválida'; end if;
  if p_unit_price is null or p_unit_price < 0 then raise exception 'Preço inválido'; end if;

  if _t.payable_id is not null then
    select * into _pay from payables where id = _t.payable_id for update;
    if _pay.id is not null and _pay.paid_at is not null then
      raise exception 'Essa transferência já foi paga em Contas a pagar. Desfaça o pagamento lá antes de editar.';
    end if;
  end if;

  _total := round(p_unit_price * _t.qty, 2);
  if _s = 'conta_a_pagar' and p_due is null then raise exception 'Informe o vencimento'; end if;
  if _total = 0 and _s in ('conta_corrente', 'conta_a_pagar') then _s := 'sem_cobranca'; end if;

  _new_pay := _t.payable_id;
  if _s = 'conta_a_pagar' then
    if _pay.id is not null and _pay.cancelled_at is null then
      update payables set amount = _total, due_date = p_due where id = _pay.id;
    else
      select business_name into _src_name from workshops where id = _t.from_workshop_id;
      select name, unit into _part_name, _unit from workshop_parts where id = _t.from_part_id;
      insert into payables (workshop_id, description, category, amount, due_date, payee, notes)
      values (_t.to_workshop_id, 'Peças recebidas de ' || coalesce(_src_name, 'outra loja') || ': ' || _t.qty || ' ' || coalesce(_unit, 'un') || ' ' || coalesce(_part_name, ''),
              'Fornecedor', _total, p_due, _src_name, 'Transferência entre lojas')
      returning id into _new_pay;
    end if;
  elsif _pay.id is not null then
    delete from payables where id = _pay.id and paid_at is null;
    _new_pay := null;
  end if;

  update stock_transfers
     set settlement = _s, unit_price = p_unit_price, total = _total,
         due_date = case when _s = 'conta_a_pagar' then p_due end,
         note = _note, payable_id = case when _s = 'conta_a_pagar' then _new_pay end,
         settled_at = case when _s = 'sem_cobranca' then coalesce(case when _t.settlement = 'sem_cobranca' then _t.settled_at end, current_date)
                           when _s = _t.settlement then _t.settled_at end,
         settled_how = case when _s = 'sem_cobranca' then 'sem cobrança'
                            when _s = _t.settlement then _t.settled_how end
   where id = _t.id;
end;
$$;

revoke all on function public.stock_transfer_update(uuid, text, numeric, date, text) from public, anon;
grant execute on function public.stock_transfer_update(uuid, text, numeric, date, text) to authenticated;
