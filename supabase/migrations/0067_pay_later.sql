-- "Pagar depois": no Receber do Caixa, o que faltar da OS vira conta a receber com vencimento.
-- Não entra na gaveta nem no fechamento (o dinheiro ainda não entrou); quando o cliente pagar,
-- recebe-se a OS normalmente pelo Caixa, na data real do pagamento.
-- Faturamento e comissão continuam contando na conclusão da OS, como sempre.

alter table public.service_orders
  add column if not exists pay_later_due    date,          -- até quando o cliente vai pagar
  add column if not exists pay_later_note   text,
  add column if not exists pay_later_set_at timestamptz,
  add column if not exists pay_later_by     uuid references public.workshop_operators(id) on delete set null;

create index if not exists service_orders_pay_later_idx
  on public.service_orders (workshop_id, pay_later_due) where pay_later_due is not null;

-- p_due null = tira o "pagar depois"
create or replace function public.cash_pay_later(
  p_workshop uuid, p_session uuid, p_os uuid, p_due date, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare _op uuid; _os service_orders;
begin
  _op := cash_actor(p_workshop, p_session, 'caixa');
  select * into _os from service_orders where id = p_os and workshop_id = p_workshop for update;
  if _os.id is null then raise exception 'OS não encontrada'; end if;
  if _os.status = 'cancelled' then raise exception 'OS cancelada'; end if;

  if p_due is null then
    update service_orders set pay_later_due = null, pay_later_note = null, pay_later_set_at = null, pay_later_by = null
     where id = p_os;
    return;
  end if;

  if round(_os.price - _os.counter_discount - _os.paid_amount, 2) <= 0 then
    raise exception 'Esta OS já está paga';
  end if;
  if p_due < current_date - 1 then raise exception 'A data para pagar não pode ser no passado'; end if;

  update service_orders
     set pay_later_due = p_due, pay_later_note = nullif(trim(coalesce(p_note, '')), ''),
         pay_later_set_at = now(), pay_later_by = _op
   where id = p_os;
end;
$$;

revoke execute on function public.cash_pay_later(uuid, uuid, uuid, date, text) from public, anon;
grant  execute on function public.cash_pay_later(uuid, uuid, uuid, date, text) to authenticated;
