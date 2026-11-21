-- Cadastro espelhado: a loja "mestre" (Jota Car) manda e as lojas "seguidoras" (JC Pneus, Check All, Check All 2)
-- recebem, em um sentido só, tudo que for criado ou alterado em:
--   • peças: nome, código, marca, unidade, categoria, subcategoria, universal, margem, preço de venda, fornecedor,
--            "serve em" (carros) e ativa;
--   • fornecedores: nome, CNPJ, telefone, contato, prazo, desconto, ativo;
--   • serviços: nome, categoria, preço, tempo, pagamento do mecânico, leva peça, ativo;
--   • kits dos serviços (peças de cada serviço por modelo de carro).
-- NÃO mexe em: estoque, estoque mínimo, notas de compra e contas a pagar (cada loja tem os seus).
-- Peça nova na mestre nasce na seguidora com estoque 0 e o custo da mestre como ponto de partida.
-- Desativar peça na mestre desativa na seguidora só se ela estiver sem estoque. Excluir nada é replicado.

create table if not exists public.catalog_links (
  master_workshop_id   uuid not null references public.workshops(id) on delete cascade,
  follower_workshop_id uuid not null references public.workshops(id) on delete cascade,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  primary key (master_workshop_id, follower_workshop_id),
  check (master_workshop_id <> follower_workshop_id)
);
alter table public.catalog_links enable row level security;
drop policy if exists catalog_links_read on public.catalog_links;
create policy catalog_links_read on public.catalog_links for select
  using (is_workshop_member(master_workshop_id, auth.uid()) or is_workshop_member(follower_workshop_id, auth.uid()) or is_admin(auth.uid()));

-- Vínculos entre o item da mestre e o item da seguidora (sobrevivem a renomear e trocar código)
create table if not exists public.catalog_part_map (
  master_part_id       uuid not null references public.workshop_parts(id) on delete cascade,
  follower_workshop_id uuid not null references public.workshops(id) on delete cascade,
  follower_part_id     uuid not null references public.workshop_parts(id) on delete cascade,
  primary key (master_part_id, follower_workshop_id)
);
create index if not exists catalog_part_map_follower_idx on public.catalog_part_map (follower_part_id);
alter table public.catalog_part_map enable row level security;

create table if not exists public.catalog_supplier_map (
  master_supplier_id   uuid not null references public.suppliers(id) on delete cascade,
  follower_workshop_id uuid not null references public.workshops(id) on delete cascade,
  follower_supplier_id uuid not null references public.suppliers(id) on delete cascade,
  primary key (master_supplier_id, follower_workshop_id)
);
alter table public.catalog_supplier_map enable row level security;

create table if not exists public.catalog_service_map (
  master_service_id    uuid not null references public.workshop_services(id) on delete cascade,
  follower_workshop_id uuid not null references public.workshops(id) on delete cascade,
  follower_service_id  uuid not null references public.workshop_services(id) on delete cascade,
  primary key (master_service_id, follower_workshop_id)
);
alter table public.catalog_service_map enable row level security;

-- Jota Car → JC Pneus, Check All, Check All 2
insert into public.catalog_links (master_workshop_id, follower_workshop_id)
select m.id, f.id from public.workshops m, public.workshops f
 where m.business_name = 'Jota Car' and f.business_name in ('JC Pneus', 'Check All', 'Check All 2')
on conflict do nothing;

-- ── Fornecedores ────────────────────────────────────────────────────────────
create or replace function public.catalog_sync_supplier(p_master_supplier uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare _s suppliers; _l record; _fid uuid; _digits text;
begin
  select * into _s from suppliers where id = p_master_supplier;
  if _s.id is null then return; end if;
  _digits := regexp_replace(coalesce(_s.cnpj, ''), '\D', '', 'g');
  for _l in select follower_workshop_id as wid from catalog_links where master_workshop_id = _s.workshop_id and active loop
    select follower_supplier_id into _fid from catalog_supplier_map where master_supplier_id = _s.id and follower_workshop_id = _l.wid;
    if _fid is not null and not exists (select 1 from suppliers where id = _fid) then _fid := null; end if;
    if _fid is null and length(_digits) >= 11 then
      select id into _fid from suppliers
       where workshop_id = _l.wid and regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = _digits order by active desc, created_at limit 1;
    end if;
    if _fid is null then
      select id into _fid from suppliers
       where workshop_id = _l.wid and lower(trim(name)) = lower(trim(_s.name)) order by active desc, created_at limit 1;
    end if;
    if _fid is null then
      if not _s.active then continue; end if;
      insert into suppliers (workshop_id, name, cnpj, phone, contact, payment_days, notes, active, discount_percent)
      values (_l.wid, _s.name, _s.cnpj, _s.phone, _s.contact, _s.payment_days, _s.notes, true, _s.discount_percent)
      returning id into _fid;
    else
      update suppliers set name = _s.name, cnpj = _s.cnpj, phone = _s.phone, contact = _s.contact,
             payment_days = _s.payment_days, notes = _s.notes, active = _s.active, discount_percent = _s.discount_percent
       where id = _fid;
    end if;
    insert into catalog_supplier_map (master_supplier_id, follower_workshop_id, follower_supplier_id)
    values (_s.id, _l.wid, _fid)
    on conflict (master_supplier_id, follower_workshop_id) do update set follower_supplier_id = excluded.follower_supplier_id;
  end loop;
end;
$$;

create or replace function public.trg_catalog_supplier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if not exists (select 1 from catalog_links where master_workshop_id = new.workshop_id and active) then return new; end if;
  perform catalog_sync_supplier(new.id);
  return new;
end;
$$;

drop trigger if exists trg_suppliers_catalog on public.suppliers;
create trigger trg_suppliers_catalog
  after insert or update of name, cnpj, phone, contact, payment_days, notes, active, discount_percent
  on public.suppliers
  for each row execute function public.trg_catalog_supplier();

-- ── Peças ───────────────────────────────────────────────────────────────────
create or replace function public.catalog_sync_part(p_master_part uuid, p_vehicles boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _m workshop_parts;
  _l record;
  _fid uuid;
  _f workshop_parts;
  _sid uuid;
begin
  select * into _m from workshop_parts where id = p_master_part;
  if _m.id is null then return; end if;

  for _l in select follower_workshop_id as wid from catalog_links where master_workshop_id = _m.workshop_id and active loop
    _fid := null;
    select follower_part_id into _fid from catalog_part_map where master_part_id = _m.id and follower_workshop_id = _l.wid;
    if _fid is not null and not exists (select 1 from workshop_parts where id = _fid) then _fid := null; end if;

    -- Fornecedor da peça: o equivalente na seguidora
    _sid := null;
    if _m.supplier_id is not null then
      select follower_supplier_id into _sid from catalog_supplier_map where master_supplier_id = _m.supplier_id and follower_workshop_id = _l.wid;
      if _sid is null then
        perform catalog_sync_supplier(_m.supplier_id);
        select follower_supplier_id into _sid from catalog_supplier_map where master_supplier_id = _m.supplier_id and follower_workshop_id = _l.wid;
      end if;
    end if;

    -- Sem vínculo ainda: acha a peça equivalente pelo código, depois pelo nome
    if _fid is null and nullif(trim(coalesce(_m.code, '')), '') is not null then
      select id into _fid from workshop_parts
       where workshop_id = _l.wid and lower(trim(code)) = lower(trim(_m.code))
       order by active desc, created_at limit 1;
    end if;
    if _fid is null then
      select id into _fid from workshop_parts
       where workshop_id = _l.wid and lower(trim(name)) = lower(trim(_m.name))
       order by active desc, created_at limit 1;
    end if;

    if _fid is null then
      if not _m.active then continue; end if;   -- peça desativada na mestre não cria cópia
      insert into workshop_parts (workshop_id, name, code, brand, unit, supplier, supplier_id, cost, margin_percent, sale_price,
                                  active, stock_qty, min_qty, category, subcategory, universal)
      values (_l.wid, _m.name, _m.code, _m.brand, _m.unit, _m.supplier, _sid, _m.cost, _m.margin_percent, _m.sale_price,
              true, 0, 0, _m.category, _m.subcategory, _m.universal)
      returning id into _fid;
    else
      select * into _f from workshop_parts where id = _fid;
      update workshop_parts
         set name = _m.name, code = _m.code, brand = _m.brand, unit = _m.unit, category = _m.category,
             supplier = _m.supplier, supplier_id = _sid,
             subcategory = _m.subcategory, universal = _m.universal, margin_percent = _m.margin_percent,
             sale_price = _m.sale_price,
             active = case when _m.active then true when _f.stock_qty = 0 then false else _f.active end
       where id = _fid;
    end if;

    insert into catalog_part_map (master_part_id, follower_workshop_id, follower_part_id)
    values (_m.id, _l.wid, _fid)
    on conflict (master_part_id, follower_workshop_id) do update set follower_part_id = excluded.follower_part_id;

    if p_vehicles then
      delete from workshop_part_vehicles where part_id = _fid;
      insert into workshop_part_vehicles (workshop_id, part_id, brand, model, year_from, year_to)
      select _l.wid, _fid, brand, model, year_from, year_to from workshop_part_vehicles where part_id = _m.id;
    end if;
  end loop;
end;
$$;

create or replace function public.trg_catalog_part()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if not exists (select 1 from catalog_links where master_workshop_id = new.workshop_id and active) then return new; end if;
  perform catalog_sync_part(new.id, false);   -- os carros vão pelo gatilho próprio
  return new;
end;
$$;

drop trigger if exists trg_workshop_parts_catalog on public.workshop_parts;
create trigger trg_workshop_parts_catalog
  after insert or update of name, code, brand, unit, category, subcategory, universal, margin_percent, sale_price, active, supplier, supplier_id
  on public.workshop_parts
  for each row execute function public.trg_catalog_part();

create or replace function public.trg_catalog_vehicle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare _wid uuid; _pid uuid;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  _wid := coalesce(new.workshop_id, old.workshop_id);
  _pid := coalesce(new.part_id, old.part_id);
  if not exists (select 1 from catalog_links where master_workshop_id = _wid and active) then return null; end if;
  if exists (select 1 from workshop_parts where id = _pid) then
    perform catalog_sync_part(_pid, true);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_part_vehicles_catalog on public.workshop_part_vehicles;
create trigger trg_part_vehicles_catalog
  after insert or update or delete on public.workshop_part_vehicles
  for each row execute function public.trg_catalog_vehicle();

-- ── Serviços e kits ─────────────────────────────────────────────────────────
create or replace function public.catalog_sync_service(p_master_service uuid, p_kits boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _s workshop_services;
  _l record;
  _fid uuid;
  _k record;
  _pid uuid;
begin
  select * into _s from workshop_services where id = p_master_service;
  if _s.id is null then return; end if;

  for _l in select follower_workshop_id as wid from catalog_links where master_workshop_id = _s.workshop_id and active loop
    _fid := null;
    select follower_service_id into _fid from catalog_service_map where master_service_id = _s.id and follower_workshop_id = _l.wid;
    if _fid is not null and not exists (select 1 from workshop_services where id = _fid) then _fid := null; end if;
    if _fid is null then
      select id into _fid from workshop_services
       where workshop_id = _l.wid and lower(trim(name)) = lower(trim(_s.name))
       order by active desc, created_at limit 1;
    end if;

    if _fid is null then
      if not _s.active then continue; end if;
      insert into workshop_services (workshop_id, name, category, price, estimated_minutes, active, mechanic_pay, leva_peca)
      values (_l.wid, _s.name, _s.category, _s.price, _s.estimated_minutes, true, _s.mechanic_pay, _s.leva_peca)
      returning id into _fid;
    else
      update workshop_services
         set name = _s.name, category = _s.category, price = _s.price, estimated_minutes = _s.estimated_minutes,
             active = _s.active, mechanic_pay = _s.mechanic_pay, leva_peca = _s.leva_peca
       where id = _fid;
    end if;

    insert into catalog_service_map (master_service_id, follower_workshop_id, follower_service_id)
    values (_s.id, _l.wid, _fid)
    on conflict (master_service_id, follower_workshop_id) do update set follower_service_id = excluded.follower_service_id;

    if p_kits then
      delete from workshop_service_parts where service_id = _fid;
      for _k in select * from workshop_service_parts where service_id = _s.id order by position, created_at loop
        _pid := null;
        if _k.part_id is not null then
          select follower_part_id into _pid from catalog_part_map where master_part_id = _k.part_id and follower_workshop_id = _l.wid;
          if _pid is null then
            perform catalog_sync_part(_k.part_id, true);
            select follower_part_id into _pid from catalog_part_map where master_part_id = _k.part_id and follower_workshop_id = _l.wid;
          end if;
        end if;
        insert into workshop_service_parts (workshop_id, service_id, part_id, description, quantity, position,
                                            vehicle_model, tech_vehicle_id, vehicle_make, vehicle_engine, year_from, year_to)
        values (_l.wid, _fid, _pid, _k.description, _k.quantity, _k.position,
                _k.vehicle_model, _k.tech_vehicle_id, _k.vehicle_make, _k.vehicle_engine, _k.year_from, _k.year_to);
      end loop;
    end if;
  end loop;
end;
$$;

create or replace function public.trg_catalog_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if not exists (select 1 from catalog_links where master_workshop_id = new.workshop_id and active) then return new; end if;
  perform catalog_sync_service(new.id, false);   -- os kits vão pelo gatilho próprio
  return new;
end;
$$;

drop trigger if exists trg_workshop_services_catalog on public.workshop_services;
create trigger trg_workshop_services_catalog
  after insert or update of name, category, price, estimated_minutes, active, mechanic_pay, leva_peca
  on public.workshop_services
  for each row execute function public.trg_catalog_service();

create or replace function public.trg_catalog_service_kit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare _wid uuid; _sid uuid;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  _wid := coalesce(new.workshop_id, old.workshop_id);
  _sid := coalesce(new.service_id, old.service_id);
  if not exists (select 1 from catalog_links where master_workshop_id = _wid and active) then return null; end if;
  if exists (select 1 from workshop_services where id = _sid) then
    perform catalog_sync_service(_sid, true);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_service_parts_catalog on public.workshop_service_parts;
create trigger trg_service_parts_catalog
  after insert or update or delete on public.workshop_service_parts
  for each row execute function public.trg_catalog_service_kit();

-- ── Acerto geral: copia tudo da mestre para as seguidoras ───────────────────
-- Rodar uma vez ao ligar, e de novo quando incluir uma loja nova na ligação.
create or replace function public.catalog_sync_all(p_master uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare _r record; _sup int := 0; _part int := 0; _svc int := 0;
begin
  for _r in select s.id from suppliers s
             where s.workshop_id in (select master_workshop_id from catalog_links where active and (p_master is null or master_workshop_id = p_master)) loop
    perform catalog_sync_supplier(_r.id); _sup := _sup + 1;
  end loop;
  for _r in select p.id from workshop_parts p
             where p.workshop_id in (select master_workshop_id from catalog_links where active and (p_master is null or master_workshop_id = p_master))
             order by p.created_at loop
    perform catalog_sync_part(_r.id, true); _part := _part + 1;
  end loop;
  for _r in select s.id from workshop_services s
             where s.workshop_id in (select master_workshop_id from catalog_links where active and (p_master is null or master_workshop_id = p_master))
             order by s.created_at loop
    perform catalog_sync_service(_r.id, true); _svc := _svc + 1;
  end loop;
  return _sup || ' fornecedores, ' || _part || ' peças, ' || _svc || ' serviços';
end;
$$;

revoke all on function public.catalog_sync_supplier(uuid) from public, anon, authenticated;
revoke all on function public.catalog_sync_part(uuid, boolean) from public, anon, authenticated;
revoke all on function public.catalog_sync_service(uuid, boolean) from public, anon, authenticated;
revoke all on function public.catalog_sync_all(uuid) from public, anon, authenticated;
revoke all on function public.trg_catalog_supplier() from public, anon, authenticated;
revoke all on function public.trg_catalog_part() from public, anon, authenticated;
revoke all on function public.trg_catalog_vehicle() from public, anon, authenticated;
revoke all on function public.trg_catalog_service() from public, anon, authenticated;
revoke all on function public.trg_catalog_service_kit() from public, anon, authenticated;
