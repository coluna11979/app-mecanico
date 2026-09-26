-- OS profissional: número sequencial por oficina, desconto e itens (peças/serviços).

-- ── 1. Número sequencial por oficina (OS nº 0001, 0002…) ────────────────────
alter table public.service_orders add column if not exists number integer;

-- Numera as OS existentes pela ordem de criação, por oficina
with ordered as (
  select id, row_number() over (partition by workshop_id order by created_at, id) as n
  from public.service_orders
)
update public.service_orders so
   set number = o.n
  from ordered o
 where so.id = o.id and so.number is null;

create or replace function public.set_service_order_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.number is null then
    -- trava por oficina: duas OS criadas ao mesmo tempo não pegam o mesmo número
    perform pg_advisory_xact_lock(hashtext('os_number:' || new.workshop_id::text));
    select coalesce(max(number), 0) + 1 into new.number
      from public.service_orders where workshop_id = new.workshop_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_orders_number on public.service_orders;
create trigger trg_service_orders_number
  before insert on public.service_orders
  for each row execute function public.set_service_order_number();

create unique index if not exists service_orders_workshop_number_uniq
  on public.service_orders (workshop_id, number);

-- ── 2. Desconto ─────────────────────────────────────────────────────────────
alter table public.service_orders add column if not exists discount numeric not null default 0;

-- ── 3. Itens da OS ──────────────────────────────────────────────────────────
create table if not exists public.service_order_items (
  id               uuid primary key default uuid_generate_v4(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  workshop_id      uuid not null,
  kind             text not null check (kind in ('part', 'labor')),  -- peça | serviço
  description      text not null,
  quantity         numeric not null default 1 check (quantity > 0),
  unit_price       numeric not null default 0 check (unit_price >= 0),
  position         integer not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists service_order_items_os_idx on public.service_order_items (service_order_id, position);

alter table public.service_order_items enable row level security;

drop policy if exists os_items_owner on public.service_order_items;
create policy os_items_owner on public.service_order_items
  for all
  using      (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

-- O item sempre herda a oficina da OS (a leitura da OS passa pelo RLS: OS de outra
-- oficina não é visível → workshop_id fica nulo → insert recusado)
create or replace function public.set_os_item_workshop()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select workshop_id into new.workshop_id
    from public.service_orders where id = new.service_order_id;
  return new;
end;
$$;

drop trigger if exists trg_service_order_items_workshop on public.service_order_items;
create trigger trg_service_order_items_workshop
  before insert or update of service_order_id on public.service_order_items
  for each row execute function public.set_os_item_workshop();

-- ── 4. Totais calculados a partir dos itens ─────────────────────────────────
-- Com itens: peças, mão de obra e total vêm dos itens (total = peças + serviços − desconto).
-- Sem itens (OS antigas): os valores digitados à mão continuam valendo.
create or replace function public.recalc_service_order_totals(p_os_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_parts numeric;
  v_labor numeric;
  v_count integer;
begin
  select count(*),
         coalesce(sum(quantity * unit_price) filter (where kind = 'part'), 0),
         coalesce(sum(quantity * unit_price) filter (where kind = 'labor'), 0)
    into v_count, v_parts, v_labor
    from public.service_order_items
   where service_order_id = p_os_id;

  if v_count = 0 then
    return;
  end if;

  update public.service_orders
     set parts_cost = round(v_parts, 2),
         labor_cost = round(v_labor, 2),
         price      = greatest(round(v_parts + v_labor - coalesce(discount, 0), 2), 0)
   where id = p_os_id;
end;
$$;

create or replace function public.trg_os_items_recalc()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.recalc_service_order_totals(coalesce(new.service_order_id, old.service_order_id));
  return null;
end;
$$;

drop trigger if exists trg_service_order_items_recalc on public.service_order_items;
create trigger trg_service_order_items_recalc
  after insert or update or delete on public.service_order_items
  for each row execute function public.trg_os_items_recalc();

-- Desconto alterado → recalcula o total (só se a OS tiver itens)
create or replace function public.trg_os_discount_recalc()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.recalc_service_order_totals(new.id);
  return null;
end;
$$;

drop trigger if exists trg_service_orders_discount on public.service_orders;
create trigger trg_service_orders_discount
  after update of discount on public.service_orders
  for each row execute function public.trg_os_discount_recalc();
