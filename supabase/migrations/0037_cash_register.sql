-- Caixa (PDV): abertura, recebimento das OS em várias formas, vales, despesas,
-- sangria, suprimento e fechamento com conferência.
-- Toda escrita passa pelas funções abaixo, que conferem a função do operador
-- (operator_can) — o navegador não grava direto nessas tabelas.

-- ── Quanto da OS já foi pago ────────────────────────────────────────────────
alter table public.service_orders
  add column if not exists paid_amount      numeric not null default 0,
  add column if not exists counter_discount numeric not null default 0,  -- desconto dado no balcão
  add column if not exists paid_at          timestamptz;                -- quitada em

-- ── Caixas (um aberto por oficina) ──────────────────────────────────────────
create table if not exists public.cash_registers (
  id              uuid primary key default uuid_generate_v4(),
  workshop_id     uuid not null references public.workshops(id) on delete cascade,
  status          text not null default 'open' check (status in ('open', 'closed')),
  opening_amount  numeric not null default 0 check (opening_amount >= 0),
  opened_at       timestamptz not null default now(),
  opened_by       uuid references public.workshop_operators(id) on delete set null,
  closed_at       timestamptz,
  closed_by       uuid references public.workshop_operators(id) on delete set null,
  counted_cash    numeric,
  expected_cash   numeric,
  summary         jsonb,          -- totais por forma de pagamento e por tipo no fechamento
  close_notes     text
);
create unique index if not exists cash_registers_one_open on public.cash_registers (workshop_id) where status = 'open';
create index if not exists cash_registers_workshop_idx on public.cash_registers (workshop_id, opened_at desc);

-- ── Recebimento de uma OS (cabeçalho; as partes ficam em cash_entries) ──────
create table if not exists public.os_payments (
  id                uuid primary key default uuid_generate_v4(),
  workshop_id       uuid not null references public.workshops(id) on delete cascade,
  register_id       uuid not null references public.cash_registers(id),
  service_order_id  uuid not null references public.service_orders(id) on delete cascade,
  amount            numeric not null check (amount > 0),   -- soma das partes
  discount          numeric not null default 0 check (discount >= 0),
  cash_given        numeric,                               -- quanto o cliente entregou em dinheiro
  change_given      numeric not null default 0,            -- troco
  operator_id       uuid references public.workshop_operators(id) on delete set null,
  created_by        uuid not null default auth.uid(),
  created_at        timestamptz not null default now(),
  cancelled_at      timestamptz,
  cancelled_by      uuid references public.workshop_operators(id) on delete set null,
  cancel_reason     text
);
create index if not exists os_payments_os_idx on public.os_payments (service_order_id);

-- ── Movimentações do caixa ──────────────────────────────────────────────────
create table if not exists public.cash_entries (
  id            uuid primary key default uuid_generate_v4(),
  workshop_id   uuid not null references public.workshops(id) on delete cascade,
  register_id   uuid not null references public.cash_registers(id),
  kind          text not null check (kind in ('recebimento', 'entrada', 'suprimento', 'sangria', 'despesa', 'vale')),
  method        text not null default 'dinheiro'
                check (method in ('dinheiro', 'pix', 'debito', 'credito', 'convenio', 'crediario')),
  amount        numeric not null check (amount > 0),
  installments  int not null default 1 check (installments between 1 and 24),
  category      text,
  description   text,
  mechanic_id   uuid references public.workshop_mechanics(id) on delete set null,  -- vale: de quem
  payment_id    uuid references public.os_payments(id) on delete cascade,
  operator_id   uuid references public.workshop_operators(id) on delete set null,
  role          text,
  created_by    uuid not null default auth.uid(),
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz,
  cancelled_by  uuid references public.workshop_operators(id) on delete set null,
  cancel_reason text
);
create index if not exists cash_entries_register_idx on public.cash_entries (register_id, created_at);
create index if not exists cash_entries_workshop_idx on public.cash_entries (workshop_id, created_at desc);

alter table public.cash_registers enable row level security;
alter table public.os_payments   enable row level security;
alter table public.cash_entries  enable row level security;

drop policy if exists cash_registers_read on public.cash_registers;
create policy cash_registers_read on public.cash_registers for select
  using (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));
drop policy if exists os_payments_read on public.os_payments;
create policy os_payments_read on public.os_payments for select
  using (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));
drop policy if exists cash_entries_read on public.cash_entries;
create policy cash_entries_read on public.cash_entries for select
  using (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

-- ── Quem está agindo ────────────────────────────────────────────────────────
-- Com sessão (modo balcão): confere a permissão da função.
-- Sem sessão: só o dono (aparelho dele, acesso completo).
-- Devolve o operador que assina o lançamento (pode ser null se o dono ainda
-- não cadastrou o próprio acesso).
create or replace function public.cash_actor(p_workshop uuid, p_session uuid, p_perm text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare _op uuid;
begin
  if p_session is null then
    if not is_workshop_owner(p_workshop, auth.uid()) then
      raise exception 'Entre com o seu PIN para usar o caixa';
    end if;
    select id into _op from workshop_operators where workshop_id = p_workshop and is_owner;
    return _op;
  end if;
  if not operator_can(p_session, p_workshop, p_perm) then
    raise exception 'Sua função não tem permissão para isso';
  end if;
  select operator_id into _op from operator_sessions where id = p_session;
  return _op;
end;
$$;

create or replace function public.cash_session_role(p_session uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from operator_sessions where id = p_session), 'gestor');
$$;

create or replace function public.cash_open_register(p_workshop uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from cash_registers where workshop_id = p_workshop and status = 'open';
$$;

-- ── Abrir caixa ─────────────────────────────────────────────────────────────
create or replace function public.cash_open(p_workshop uuid, p_session uuid, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare _op uuid; _id uuid;
begin
  _op := cash_actor(p_workshop, p_session, 'caixa');
  if cash_open_register(p_workshop) is not null then
    raise exception 'Já existe um caixa aberto';
  end if;
  if coalesce(p_amount, 0) < 0 then raise exception 'Valor inválido'; end if;
  insert into cash_registers (workshop_id, opening_amount, opened_by)
  values (p_workshop, coalesce(p_amount, 0), _op)
  returning id into _id;
  return _id;
end;
$$;

-- ── Receber OS (uma ou várias formas) ───────────────────────────────────────
-- p_parts: [{ "method": "dinheiro", "amount": 200 }, { "method": "credito", "amount": 500, "installments": 3 }]
create or replace function public.cash_receive_os(
  p_workshop uuid, p_session uuid, p_os uuid, p_parts jsonb,
  p_discount numeric default 0, p_cash_given numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _op uuid; _reg uuid; _os service_orders; _pay uuid;
  _total numeric := 0; _cash numeric := 0; _remaining numeric; _part jsonb;
  _method text; _amt numeric; _inst int;
begin
  _op := cash_actor(p_workshop, p_session, 'caixa');
  _reg := cash_open_register(p_workshop);
  if _reg is null then raise exception 'Abra o caixa antes de receber'; end if;

  select * into _os from service_orders where id = p_os and workshop_id = p_workshop for update;
  if _os.id is null then raise exception 'OS não encontrada'; end if;
  if _os.status = 'cancelled' then raise exception 'OS cancelada não pode ser recebida'; end if;

  p_discount := coalesce(p_discount, 0);
  if p_discount < 0 then raise exception 'Desconto inválido'; end if;
  if p_discount > 0 then perform cash_actor(p_workshop, p_session, 'dar_desconto'); end if;

  _remaining := round(_os.price - _os.counter_discount - _os.paid_amount - p_discount, 2);
  if _remaining < 0 then raise exception 'Desconto maior que o valor em aberto'; end if;

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
    if _method = 'dinheiro' then _cash := _cash + _amt; end if;
  end loop;

  if _total > _remaining + 0.001 then
    raise exception 'O total informado (R$ %) passa do valor em aberto (R$ %)', _total, _remaining;
  end if;
  if p_cash_given is not null and p_cash_given < _cash then
    raise exception 'Valor entregue em dinheiro menor que a parte em dinheiro';
  end if;

  insert into os_payments (workshop_id, register_id, service_order_id, amount, discount, cash_given, change_given, operator_id)
  values (p_workshop, _reg, p_os, _total, p_discount, p_cash_given,
          case when p_cash_given is null then 0 else p_cash_given - _cash end, _op)
  returning id into _pay;

  for _part in select * from jsonb_array_elements(p_parts) loop
    _method := _part->>'method';
    _amt := round((_part->>'amount')::numeric, 2);
    _inst := case when _method = 'credito' then greatest(1, least(24, coalesce((_part->>'installments')::int, 1))) else 1 end;
    insert into cash_entries (workshop_id, register_id, kind, method, amount, installments, description, payment_id, operator_id, role)
    values (p_workshop, _reg, 'recebimento', _method, _amt, _inst,
            'OS nº ' || coalesce(lpad(_os.number::text, 4, '0'), left(_os.id::text, 8)),
            _pay, _op, cash_session_role(p_session));
  end loop;

  update service_orders
     set paid_amount = paid_amount + _total,
         counter_discount = counter_discount + p_discount,
         paid_at = case when round(price - counter_discount - p_discount - paid_amount - _total, 2) <= 0 then now() else null end
   where id = p_os;

  return _pay;
end;
$$;

-- ── Vale, despesa, sangria, suprimento, entrada avulsa ──────────────────────
create or replace function public.cash_movement(
  p_workshop uuid, p_session uuid, p_kind text, p_amount numeric,
  p_category text default null, p_description text default null, p_mechanic uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare _op uuid; _reg uuid; _id uuid;
begin
  _op := cash_actor(p_workshop, p_session, 'caixa');
  _reg := cash_open_register(p_workshop);
  if _reg is null then raise exception 'Abra o caixa antes de lançar'; end if;
  if p_kind not in ('entrada', 'suprimento', 'sangria', 'despesa', 'vale') then
    raise exception 'Tipo de lançamento inválido';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  if p_kind = 'vale' and p_mechanic is null then raise exception 'Escolha o colaborador do vale'; end if;
  if p_mechanic is not null and not exists (select 1 from workshop_mechanics where id = p_mechanic and workshop_id = p_workshop) then
    raise exception 'Colaborador não encontrado';
  end if;

  insert into cash_entries (workshop_id, register_id, kind, method, amount, category, description, mechanic_id, operator_id, role)
  values (p_workshop, _reg, p_kind, 'dinheiro', round(p_amount, 2), nullif(trim(p_category), ''),
          nullif(trim(p_description), ''), p_mechanic, _op, cash_session_role(p_session))
  returning id into _id;
  return _id;
end;
$$;

-- ── Estornar: um recebimento inteiro (p_payment) ou um lançamento avulso (p_entry)
create or replace function public.cash_cancel(
  p_workshop uuid, p_session uuid, p_reason text, p_payment uuid default null, p_entry uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare _op uuid; _reg uuid; _pay os_payments; _e cash_entries;
begin
  _op := cash_actor(p_workshop, p_session, 'cancelar_recebimento');
  if coalesce(trim(p_reason), '') = '' then raise exception 'Informe o motivo do estorno'; end if;

  if p_payment is not null then
    select * into _pay from os_payments where id = p_payment and workshop_id = p_workshop for update;
    if _pay.id is null or _pay.cancelled_at is not null then raise exception 'Recebimento não encontrado'; end if;
    _reg := _pay.register_id;
  else
    select * into _e from cash_entries where id = p_entry and workshop_id = p_workshop for update;
    if _e.id is null or _e.cancelled_at is not null then raise exception 'Lançamento não encontrado'; end if;
    if _e.payment_id is not null then raise exception 'Estorne o recebimento inteiro da OS'; end if;
    _reg := _e.register_id;
  end if;

  if (select status from cash_registers where id = _reg) <> 'open' then
    raise exception 'Esse caixa já foi fechado. Reabra o caixa para estornar.';
  end if;

  if p_payment is not null then
    update os_payments set cancelled_at = now(), cancelled_by = _op, cancel_reason = p_reason where id = p_payment;
    update cash_entries set cancelled_at = now(), cancelled_by = _op, cancel_reason = p_reason where payment_id = p_payment;
    update service_orders
       set paid_amount = greatest(0, paid_amount - _pay.amount),
           counter_discount = greatest(0, counter_discount - _pay.discount),
           paid_at = null
     where id = _pay.service_order_id;
  else
    update cash_entries set cancelled_at = now(), cancelled_by = _op, cancel_reason = p_reason where id = p_entry;
  end if;
end;
$$;

-- ── Resumo do caixa (usado na tela e no fechamento) ─────────────────────────
create or replace function public.cash_register_summary(p_register uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with r as (select * from cash_registers where id = p_register and is_workshop_member(workshop_id, auth.uid())),
  e as (select * from cash_entries where register_id = p_register and cancelled_at is null)
  select jsonb_build_object(
    'opening', (select opening_amount from r),
    'by_method', coalesce((select jsonb_object_agg(method, total) from (
        select method, sum(amount) total from e where kind = 'recebimento' group by method) m), '{}'::jsonb),
    'by_kind', coalesce((select jsonb_object_agg(kind, total) from (
        select kind, sum(amount) total from e group by kind) k), '{}'::jsonb),
    'change_given', coalesce((select sum(change_given) from os_payments where register_id = p_register and cancelled_at is null), 0),
    'expected_cash', (select opening_amount from r)
        + coalesce((select sum(case when kind in ('recebimento', 'entrada', 'suprimento') then amount
                                    when kind in ('sangria', 'despesa', 'vale') then -amount end)
                      from e where method = 'dinheiro'), 0)
  )
  where exists (select 1 from r);
$$;

-- ── Fechar caixa ────────────────────────────────────────────────────────────
create or replace function public.cash_close(p_workshop uuid, p_session uuid, p_counted numeric, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare _op uuid; _reg uuid; _sum jsonb;
begin
  _op := cash_actor(p_workshop, p_session, 'caixa');
  _reg := cash_open_register(p_workshop);
  if _reg is null then raise exception 'Nenhum caixa aberto'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Informe quanto tem de dinheiro na gaveta'; end if;

  _sum := cash_register_summary(_reg);
  update cash_registers
     set status = 'closed', closed_at = now(), closed_by = _op, counted_cash = round(p_counted, 2),
         expected_cash = (_sum->>'expected_cash')::numeric, summary = _sum, close_notes = nullif(trim(p_notes), '')
   where id = _reg;
  return _sum || jsonb_build_object('counted', round(p_counted, 2),
                                    'difference', round(p_counted - (_sum->>'expected_cash')::numeric, 2));
end;
$$;

-- ── Reabrir o último caixa fechado ──────────────────────────────────────────
create or replace function public.cash_reopen(p_workshop uuid, p_session uuid, p_register uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform cash_actor(p_workshop, p_session, 'reabrir_caixa');
  if cash_open_register(p_workshop) is not null then raise exception 'Já existe um caixa aberto'; end if;
  if p_register <> (select id from cash_registers where workshop_id = p_workshop order by opened_at desc limit 1) then
    raise exception 'Só dá para reabrir o último caixa';
  end if;
  update cash_registers
     set status = 'open', closed_at = null, closed_by = null, counted_cash = null,
         expected_cash = null, summary = null, close_notes = null
   where id = p_register and workshop_id = p_workshop;
end;
$$;

revoke all on function public.cash_actor(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.cash_session_role(uuid) from public, anon, authenticated;
revoke all on function public.cash_open_register(uuid) from public, anon, authenticated;
revoke all on function public.cash_open(uuid, uuid, numeric) from public, anon;
revoke all on function public.cash_receive_os(uuid, uuid, uuid, jsonb, numeric, numeric) from public, anon;
revoke all on function public.cash_movement(uuid, uuid, text, numeric, text, text, uuid) from public, anon;
revoke all on function public.cash_cancel(uuid, uuid, text, uuid, uuid) from public, anon;
revoke all on function public.cash_register_summary(uuid) from public, anon;
revoke all on function public.cash_close(uuid, uuid, numeric, text) from public, anon;
revoke all on function public.cash_reopen(uuid, uuid, uuid) from public, anon;
grant execute on function public.cash_open(uuid, uuid, numeric) to authenticated;
grant execute on function public.cash_receive_os(uuid, uuid, uuid, jsonb, numeric, numeric) to authenticated;
grant execute on function public.cash_movement(uuid, uuid, text, numeric, text, text, uuid) to authenticated;
grant execute on function public.cash_cancel(uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.cash_register_summary(uuid) to authenticated;
grant execute on function public.cash_close(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.cash_reopen(uuid, uuid, uuid) to authenticated;
