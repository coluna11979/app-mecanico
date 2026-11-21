-- Transferência entre lojas com forma de acerto escolhida na hora (como forma de pagamento):
--   sem_cobranca   → só movimenta estoque
--   conta_corrente → fica devendo; as lojas fazem o acerto depois (PIX, banco, caixa...)
--   conta_a_pagar  → gera conta a pagar na loja que recebeu, com vencimento
--   troca          → a loja que recebeu devolve outra peça depois
-- O preço do repasse é por unidade (custo, custo + margem, preço de venda ou outro valor).

create table if not exists public.stock_transfers (
  id               uuid primary key default uuid_generate_v4(),
  from_workshop_id uuid not null references public.workshops(id) on delete cascade,
  to_workshop_id   uuid not null references public.workshops(id) on delete cascade,
  from_part_id     uuid references public.workshop_parts(id) on delete set null,
  to_part_id       uuid references public.workshop_parts(id) on delete set null,
  qty              numeric not null check (qty > 0),
  unit_price       numeric not null default 0 check (unit_price >= 0),
  total            numeric not null default 0 check (total >= 0),
  settlement       text not null default 'sem_cobranca'
                   check (settlement in ('sem_cobranca', 'conta_corrente', 'conta_a_pagar', 'troca')),
  due_date         date,
  note             text,
  payable_id       uuid references public.payables(id) on delete set null,
  settled_at       date,            -- null = em aberto
  settled_how      text,            -- PIX, banco, caixa, peça devolvida...
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now()
);
create index if not exists stock_transfers_from_idx on public.stock_transfers (from_workshop_id, created_at desc);
create index if not exists stock_transfers_to_idx   on public.stock_transfers (to_workshop_id, created_at desc);
create index if not exists stock_transfers_payable_idx on public.stock_transfers (payable_id) where payable_id is not null;

alter table public.stock_transfers enable row level security;
drop policy if exists stock_transfers_read on public.stock_transfers;
create policy stock_transfers_read on public.stock_transfers for select
  using (is_workshop_member(from_workshop_id, auth.uid()) or is_workshop_member(to_workshop_id, auth.uid()) or is_admin(auth.uid()));
-- sem policy de escrita: só pelas funções abaixo

-- As transferências já feitas (antes desta tabela) entram como "sem cobrança"
insert into public.stock_transfers (from_workshop_id, to_workshop_id, from_part_id, to_part_id, qty, unit_price, total,
                                    settlement, settled_at, settled_how, created_by, created_at)
select s.workshop_id, e.workshop_id, s.part_id, e.part_id, e.qty, coalesce(p.cost, 0), e.qty * coalesce(p.cost, 0),
       'sem_cobranca', e.created_at::date, 'sem cobrança', e.created_by, e.created_at
  from public.stock_movements e
  join public.stock_movements s on s.kind = 'transf_saida' and s.created_at = e.created_at and s.qty = -e.qty
       and s.created_by is not distinct from e.created_by
  left join public.workshop_parts p on p.id = s.part_id
 where e.kind = 'transf_entrada'
   and not exists (select 1 from public.stock_transfers t where t.created_at = e.created_at and t.to_part_id = e.part_id);

drop function if exists public.stock_transfer(uuid, uuid, numeric, text);

create or replace function public.stock_transfer(
  p_part uuid, p_dest_workshop uuid, p_qty numeric, p_note text default null,
  p_settlement text default 'sem_cobranca', p_unit_price numeric default null, p_due date default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _src  workshop_parts;
  _dst  workshop_parts;
  _src_name text;
  _dst_name text;
  _note text := nullif(trim(coalesce(p_note, '')), '');
  _new_cost numeric;
  _price numeric;
  _total numeric;
  _pay uuid;
  _settlement text := coalesce(p_settlement, 'sem_cobranca');
begin
  if _settlement not in ('sem_cobranca', 'conta_corrente', 'conta_a_pagar', 'troca') then raise exception 'Forma de acerto inválida'; end if;
  select * into _src from workshop_parts where id = p_part for update;
  if _src.id is null or not is_workshop_member(_src.workshop_id, auth.uid()) then raise exception 'Peça não encontrada'; end if;
  if p_dest_workshop is null or p_dest_workshop = _src.workshop_id then raise exception 'Escolha outra loja de destino'; end if;
  if not is_workshop_member(p_dest_workshop, auth.uid()) then raise exception 'Você não tem acesso à loja de destino'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantidade inválida'; end if;
  if p_qty > _src.stock_qty then
    raise exception 'Só há % % em estoque. Ajuste o estoque antes de transferir.', _src.stock_qty, _src.unit;
  end if;
  _price := coalesce(p_unit_price, _src.cost);
  if _price < 0 then raise exception 'Preço inválido'; end if;
  _total := round(_price * p_qty, 2);
  if _settlement = 'conta_a_pagar' and p_due is null then raise exception 'Informe o vencimento'; end if;
  if _total = 0 and _settlement in ('conta_corrente', 'conta_a_pagar') then _settlement := 'sem_cobranca'; end if;

  select business_name into _src_name from workshops where id = _src.workshop_id;
  select business_name into _dst_name from workshops where id = p_dest_workshop;

  if nullif(trim(coalesce(_src.code, '')), '') is not null then
    select * into _dst from workshop_parts
     where workshop_id = p_dest_workshop and lower(trim(code)) = lower(trim(_src.code))
     order by active desc, created_at limit 1 for update;
  end if;
  if _dst.id is null then
    select * into _dst from workshop_parts
     where workshop_id = p_dest_workshop and lower(trim(name)) = lower(trim(_src.name))
     order by active desc, created_at limit 1 for update;
  end if;

  if _dst.id is null then
    -- Peça nova na loja de destino: o custo dela é o preço do repasse; o preço de venda é recalculado pela margem de lá
    insert into workshop_parts (workshop_id, name, code, brand, unit, supplier, cost, margin_percent, sale_price,
                                active, stock_qty, min_qty, category, subcategory, universal)
    values (p_dest_workshop, _src.name, _src.code, _src.brand, _src.unit, _src.supplier, _price, _src.margin_percent,
            _src.sale_price, true, 0, 0, _src.category, _src.subcategory, _src.universal)
    returning * into _dst;
    insert into workshop_part_vehicles (workshop_id, part_id, brand, model, year_from, year_to)
    select p_dest_workshop, _dst.id, brand, model, year_from, year_to from workshop_part_vehicles where part_id = _src.id;
  else
    -- Custo médio ponderado com o que a loja de destino já tinha
    if _dst.stock_qty > 0 and _price > 0 then
      _new_cost := round((_dst.stock_qty * _dst.cost + p_qty * _price) / (_dst.stock_qty + p_qty), 2);
      update workshop_parts set cost = _new_cost, active = true where id = _dst.id;
    elsif _dst.stock_qty <= 0 and _price > 0 then
      update workshop_parts set cost = _price, active = true where id = _dst.id;
    else
      update workshop_parts set active = true where id = _dst.id;
    end if;
    if not exists (select 1 from workshop_part_vehicles where part_id = _dst.id) then
      insert into workshop_part_vehicles (workshop_id, part_id, brand, model, year_from, year_to)
      select p_dest_workshop, _dst.id, brand, model, year_from, year_to from workshop_part_vehicles where part_id = _src.id;
    end if;
  end if;

  update workshop_parts set stock_qty = stock_qty - p_qty where id = _src.id;
  update workshop_parts set stock_qty = stock_qty + p_qty where id = _dst.id;

  insert into stock_movements (workshop_id, part_id, qty, kind, note) values
    (_src.workshop_id, _src.id, -p_qty, 'transf_saida',
     'Transferência para ' || coalesce(_dst_name, 'outra loja') || coalesce(': ' || _note, '')),
    (p_dest_workshop, _dst.id, p_qty, 'transf_entrada',
     'Transferência de ' || coalesce(_src_name, 'outra loja') || coalesce(': ' || _note, ''));

  if _settlement = 'conta_a_pagar' then
    insert into payables (workshop_id, description, category, amount, due_date, payee, notes)
    values (p_dest_workshop, 'Peças recebidas de ' || coalesce(_src_name, 'outra loja') || ': ' || p_qty || ' ' || _src.unit || ' ' || _src.name,
            'Fornecedor', _total, p_due, _src_name, 'Transferência entre lojas')
    returning id into _pay;
  end if;

  insert into stock_transfers (from_workshop_id, to_workshop_id, from_part_id, to_part_id, qty, unit_price, total,
                               settlement, due_date, note, payable_id, settled_at, settled_how)
  values (_src.workshop_id, p_dest_workshop, _src.id, _dst.id, p_qty, _price, _total,
          _settlement, case when _settlement = 'conta_a_pagar' then p_due end, _note, _pay,
          case when _settlement = 'sem_cobranca' then current_date end,
          case when _settlement = 'sem_cobranca' then 'sem cobrança' end);

  return _dst.id;
end;
$$;

-- Acerto: marca transferências em aberto (conta corrente ou troca) como acertadas
create or replace function public.stock_transfer_settle(p_ids uuid[], p_how text, p_date date default current_date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare _n int;
begin
  if nullif(trim(coalesce(p_how, '')), '') is null then raise exception 'Diga como foi o acerto'; end if;
  update stock_transfers t
     set settled_at = coalesce(p_date, current_date), settled_how = trim(p_how)
   where t.id = any (p_ids) and t.settled_at is null and t.settlement in ('conta_corrente', 'troca')
     and (is_workshop_member(t.from_workshop_id, auth.uid()) or is_workshop_member(t.to_workshop_id, auth.uid()));
  get diagnostics _n = row_count;
  return _n;
end;
$$;

-- Acerto desfeito
create or replace function public.stock_transfer_unsettle(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare _n int;
begin
  update stock_transfers t set settled_at = null, settled_how = null
   where t.id = any (p_ids) and t.settled_at is not null and t.settlement in ('conta_corrente', 'troca')
     and (is_workshop_member(t.from_workshop_id, auth.uid()) or is_workshop_member(t.to_workshop_id, auth.uid()));
  get diagnostics _n = row_count;
  return _n;
end;
$$;

-- Conta a pagar da transferência paga (ou desfeita) → a transferência acompanha
create or replace function public.trg_payable_transfer_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update stock_transfers set settled_at = new.paid_at, settled_how = case when new.paid_at is null then null else coalesce(new.paid_from, 'conta paga') end
   where payable_id = new.id;
  return new;
end;
$$;
drop trigger if exists trg_payables_transfer_sync on public.payables;
create trigger trg_payables_transfer_sync after update of paid_at on public.payables
  for each row execute function public.trg_payable_transfer_sync();

revoke all on function public.stock_transfer(uuid, uuid, numeric, text, text, numeric, date) from public, anon;
revoke all on function public.stock_transfer_settle(uuid[], text, date) from public, anon;
revoke all on function public.stock_transfer_unsettle(uuid[]) from public, anon;
revoke all on function public.trg_payable_transfer_sync() from public, anon, authenticated;
grant execute on function public.stock_transfer(uuid, uuid, numeric, text, text, numeric, date) to authenticated;
grant execute on function public.stock_transfer_settle(uuid[], text, date) to authenticated;
grant execute on function public.stock_transfer_unsettle(uuid[]) to authenticated;
