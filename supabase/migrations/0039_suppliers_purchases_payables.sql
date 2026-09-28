-- Fornecedores → nota de compra → estoque + custo da peça + contas a pagar.
-- Versão simples:
--   • Custo da peça = custo da última compra (o preço de venda acompanha pela margem).
--   • A peça sai do estoque quando a OS é concluída (e volta se a OS for reaberta).
--   • Lançar/estornar nota e pagar/desfazer pagamento passam por funções (tudo ou nada).

-- ── Fornecedores ────────────────────────────────────────────────────────────
create table if not exists public.suppliers (
  id            uuid primary key default uuid_generate_v4(),
  workshop_id   uuid not null references public.workshops(id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  cnpj          text,
  phone         text,
  contact       text,                              -- vendedor / pessoa de contato
  payment_days  int not null default 0 check (payment_days between 0 and 365),  -- prazo padrão
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists suppliers_workshop_idx on public.suppliers (workshop_id, lower(name));

-- ── Peça: fornecedor, estoque e estoque mínimo ──────────────────────────────
alter table public.workshop_parts
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists stock_qty   numeric not null default 0,
  add column if not exists min_qty     numeric not null default 0 check (min_qty >= 0);

-- ── Notas de compra ─────────────────────────────────────────────────────────
create table if not exists public.purchase_invoices (
  id             uuid primary key default uuid_generate_v4(),
  workshop_id    uuid not null references public.workshops(id) on delete cascade,
  supplier_id    uuid not null references public.suppliers(id),
  number         text,
  issue_date     date not null default current_date,
  freight        numeric not null default 0 check (freight >= 0),
  discount       numeric not null default 0 check (discount >= 0),
  total          numeric not null check (total >= 0),
  status         text not null default 'posted' check (status in ('posted', 'cancelled')),
  notes          text,
  created_by     uuid not null default auth.uid(),
  created_at     timestamptz not null default now(),
  cancelled_at   timestamptz,
  cancel_reason  text
);
create index if not exists purchase_invoices_workshop_idx on public.purchase_invoices (workshop_id, issue_date desc);

create table if not exists public.purchase_items (
  id           uuid primary key default uuid_generate_v4(),
  invoice_id   uuid not null references public.purchase_invoices(id) on delete cascade,
  workshop_id  uuid not null references public.workshops(id) on delete cascade,
  part_id      uuid not null references public.workshop_parts(id),
  description  text not null,
  quantity     numeric not null check (quantity > 0),
  unit_cost    numeric not null check (unit_cost >= 0),
  prev_cost    numeric                          -- custo da peça antes desta nota (para o estorno)
);
create index if not exists purchase_items_invoice_idx on public.purchase_items (invoice_id);

-- ── Movimentos de estoque ───────────────────────────────────────────────────
create table if not exists public.stock_movements (
  id                uuid primary key default uuid_generate_v4(),
  workshop_id       uuid not null references public.workshops(id) on delete cascade,
  part_id           uuid not null references public.workshop_parts(id) on delete cascade,
  qty               numeric not null,           -- + entrou, − saiu
  kind              text not null check (kind in ('compra', 'estorno_compra', 'os', 'estorno_os', 'ajuste')),
  invoice_id        uuid references public.purchase_invoices(id) on delete set null,
  service_order_id  uuid references public.service_orders(id) on delete set null,
  note              text,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now()
);
create index if not exists stock_movements_part_idx on public.stock_movements (part_id, created_at desc);

-- ── Contas a pagar ──────────────────────────────────────────────────────────
create table if not exists public.payables (
  id             uuid primary key default uuid_generate_v4(),
  workshop_id    uuid not null references public.workshops(id) on delete cascade,
  supplier_id    uuid references public.suppliers(id) on delete set null,
  invoice_id     uuid references public.purchase_invoices(id) on delete cascade,
  description    text not null check (length(trim(description)) > 0),
  category       text not null default 'Outros',
  installment    text,                          -- "1/3"
  amount         numeric not null check (amount > 0),
  due_date       date not null,
  paid_at        date,
  paid_from      text check (paid_from in ('banco', 'caixa')),
  cash_entry_id  uuid references public.cash_entries(id) on delete set null,
  created_by     uuid not null default auth.uid(),
  created_at     timestamptz not null default now(),
  cancelled_at   timestamptz
);
create index if not exists payables_workshop_due_idx on public.payables (workshop_id, due_date) where cancelled_at is null;

-- ── RLS: membros da oficina (a escrita de nota/pagamento vai pelas funções) ─
alter table public.suppliers         enable row level security;
alter table public.purchase_invoices enable row level security;
alter table public.purchase_items    enable row level security;
alter table public.stock_movements   enable row level security;
alter table public.payables          enable row level security;

drop policy if exists suppliers_members on public.suppliers;
create policy suppliers_members on public.suppliers for all
  using      (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

drop policy if exists purchase_invoices_read on public.purchase_invoices;
create policy purchase_invoices_read on public.purchase_invoices for select
  using (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));
drop policy if exists purchase_items_read on public.purchase_items;
create policy purchase_items_read on public.purchase_items for select
  using (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));
drop policy if exists stock_movements_read on public.stock_movements;
create policy stock_movements_read on public.stock_movements for select
  using (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

-- Contas avulsas (aluguel, luz…) são lançadas direto; pagar/desfazer vai pelas funções
drop policy if exists payables_read on public.payables;
create policy payables_read on public.payables for select
  using (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));
drop policy if exists payables_insert on public.payables;
create policy payables_insert on public.payables for insert
  with check (is_workshop_member(workshop_id, auth.uid()) and invoice_id is null and paid_at is null);
drop policy if exists payables_update on public.payables;
create policy payables_update on public.payables for update
  using      (is_workshop_member(workshop_id, auth.uid()) and invoice_id is null and paid_at is null)
  with check (is_workshop_member(workshop_id, auth.uid()) and invoice_id is null and paid_at is null);

drop trigger if exists trg_suppliers_touch on public.suppliers;
create trigger trg_suppliers_touch before update on public.suppliers
  for each row execute function public.touch_updated_at();

-- ── Lançar nota de compra ───────────────────────────────────────────────────
-- p_items: [{ "part_id": uuid | null, "name": "Peça nova", "unit": "un", "quantity": 2, "unit_cost": 50 }]
-- p_installments: [{ "due_date": "2026-10-28", "amount": 100 }]  (soma = total da nota)
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
  _inv uuid; _it jsonb; _part uuid; _qty numeric; _cost numeric; _prev numeric; _name text;
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
    if _part is null then
      _name := trim(coalesce(_it->>'name', ''));
      if _name = '' then raise exception 'Informe o nome da peça nova'; end if;
      insert into workshop_parts (workshop_id, name, unit, cost, supplier_id)
      values (p_workshop, _name, coalesce(nullif(_it->>'unit', ''), 'un'), _cost, p_supplier)
      returning id, 0 into _part, _prev;
    else
      select cost, name into _prev, _name from workshop_parts where id = _part and workshop_id = p_workshop for update;
      if _name is null then raise exception 'Peça não encontrada'; end if;
    end if;

    insert into purchase_items (invoice_id, workshop_id, part_id, description, quantity, unit_cost, prev_cost)
    values (_inv, p_workshop, _part, _name, _qty, _cost, _prev);
    update workshop_parts
       set stock_qty = stock_qty + _qty, cost = _cost, supplier_id = coalesce(supplier_id, p_supplier)
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

-- ── Estornar nota (desfaz estoque, custo e parcelas; exige parcelas em aberto) ─
create or replace function public.purchase_cancel(p_invoice uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare _inv purchase_invoices; _it purchase_items;
begin
  select * into _inv from purchase_invoices where id = p_invoice for update;
  if _inv.id is null or not is_workshop_member(_inv.workshop_id, auth.uid()) then raise exception 'Nota não encontrada'; end if;
  if _inv.status = 'cancelled' then raise exception 'Nota já estornada'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Informe o motivo do estorno'; end if;
  if exists (select 1 from payables where invoice_id = p_invoice and paid_at is not null and cancelled_at is null) then
    raise exception 'Há parcela paga desta nota. Desfaça o pagamento antes de estornar.';
  end if;

  for _it in select * from purchase_items where invoice_id = p_invoice loop
    update workshop_parts
       set stock_qty = stock_qty - _it.quantity,
           -- só volta o custo se ninguém mudou depois desta nota
           cost = case when cost = _it.unit_cost and _it.prev_cost is not null then _it.prev_cost else cost end
     where id = _it.part_id;
    insert into stock_movements (workshop_id, part_id, qty, kind, invoice_id, note)
    values (_inv.workshop_id, _it.part_id, -_it.quantity, 'estorno_compra', p_invoice, 'Estorno: ' || trim(p_reason));
  end loop;

  update payables set cancelled_at = now() where invoice_id = p_invoice and cancelled_at is null;
  update purchase_invoices set status = 'cancelled', cancelled_at = now(), cancel_reason = trim(p_reason) where id = p_invoice;
end;
$$;

-- ── Pagar conta (pelo banco, ou com o dinheiro do caixa aberto) ─────────────
create or replace function public.payable_pay(p_payable uuid, p_from text, p_paid_at date default current_date, p_session uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare _p payables; _entry uuid;
begin
  select * into _p from payables where id = p_payable for update;
  if _p.id is null or _p.cancelled_at is not null or not is_workshop_member(_p.workshop_id, auth.uid()) then
    raise exception 'Conta não encontrada';
  end if;
  if _p.paid_at is not null then raise exception 'Essa conta já está paga'; end if;
  if p_from not in ('banco', 'caixa') then raise exception 'Escolha de onde saiu o dinheiro'; end if;

  if p_from = 'caixa' then
    _entry := cash_movement(_p.workshop_id, p_session, 'despesa', _p.amount, _p.category,
                            _p.description || coalesce(' (' || _p.installment || ')', ''), null);
  end if;
  update payables
     set paid_at = case when p_from = 'caixa' then current_date else coalesce(p_paid_at, current_date) end,
         paid_from = p_from, cash_entry_id = _entry
   where id = p_payable;
end;
$$;

-- ── Desfazer pagamento (pelo caixa: só com o caixa ainda aberto) ────────────
create or replace function public.payable_unpay(p_payable uuid, p_session uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare _p payables;
begin
  select * into _p from payables where id = p_payable for update;
  if _p.id is null or not is_workshop_member(_p.workshop_id, auth.uid()) then raise exception 'Conta não encontrada'; end if;
  if _p.paid_at is null then raise exception 'Essa conta não está paga'; end if;
  if _p.cash_entry_id is not null then
    perform cash_cancel(_p.workshop_id, p_session, 'Pagamento de conta desfeito', null, _p.cash_entry_id);
  end if;
  update payables set paid_at = null, paid_from = null, cash_entry_id = null where id = p_payable;
end;
$$;

-- ── Ajuste de estoque (contagem) ────────────────────────────────────────────
create or replace function public.stock_adjust(p_part uuid, p_counted numeric, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare _p workshop_parts;
begin
  select * into _p from workshop_parts where id = p_part for update;
  if _p.id is null or not is_workshop_member(_p.workshop_id, auth.uid()) then raise exception 'Peça não encontrada'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Quantidade inválida'; end if;
  if p_counted = _p.stock_qty then return; end if;
  insert into stock_movements (workshop_id, part_id, qty, kind, note)
  values (_p.workshop_id, p_part, p_counted - _p.stock_qty, 'ajuste', coalesce(nullif(trim(p_note), ''), 'Contagem de estoque'));
  update workshop_parts set stock_qty = p_counted where id = p_part;
end;
$$;

-- ── OS concluída: baixa as peças do cadastro; OS reaberta: devolve ──────────
create or replace function public.trg_os_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare _it record; _sign int; _label text;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then _sign := -1;
  elsif old.status = 'completed' and new.status is distinct from 'completed' then _sign := 1;
  else return new;
  end if;
  _label := 'OS nº ' || coalesce(lpad(new.number::text, 4, '0'), left(new.id::text, 8));
  for _it in
    select part_id, sum(quantity) qty from service_order_items
     where service_order_id = new.id and kind = 'part' and part_id is not null
     group by part_id
  loop
    update workshop_parts set stock_qty = stock_qty + _sign * _it.qty where id = _it.part_id;
    insert into stock_movements (workshop_id, part_id, qty, kind, service_order_id, note)
    values (new.workshop_id, _it.part_id, _sign * _it.qty, case when _sign < 0 then 'os' else 'estorno_os' end,
            new.id, case when _sign < 0 then _label else _label || ' reaberta' end);
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_service_orders_stock on public.service_orders;
create trigger trg_service_orders_stock
  after update of status on public.service_orders
  for each row execute function public.trg_os_stock();

revoke all on function public.purchase_post(uuid, uuid, text, date, numeric, numeric, jsonb, jsonb, text) from public, anon;
revoke all on function public.purchase_cancel(uuid, text) from public, anon;
revoke all on function public.payable_pay(uuid, text, date, uuid) from public, anon;
revoke all on function public.payable_unpay(uuid, uuid) from public, anon;
revoke all on function public.stock_adjust(uuid, numeric, text) from public, anon;
grant execute on function public.purchase_post(uuid, uuid, text, date, numeric, numeric, jsonb, jsonb, text) to authenticated;
grant execute on function public.purchase_cancel(uuid, text) to authenticated;
grant execute on function public.payable_pay(uuid, text, date, uuid) to authenticated;
grant execute on function public.payable_unpay(uuid, uuid) to authenticated;
grant execute on function public.stock_adjust(uuid, numeric, text) to authenticated;
revoke all on function public.trg_os_stock() from public, anon, authenticated;
