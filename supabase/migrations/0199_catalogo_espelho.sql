-- Cadastro de peças espelhado: a loja "mestre" (Jota Car) manda e as lojas "seguidoras" (JC Pneus, Check All, Check All 2)
-- recebem, em um sentido só, tudo que for criado ou alterado no cadastro da peça.
-- Sincroniza: nome, código, marca, unidade, categoria, subcategoria, universal, margem, preço de venda, "serve em" (carros) e ativa.
-- NÃO mexe em: estoque, estoque mínimo, fornecedor, notas de compra e contas a pagar (cada loja tem os seus).
-- Peça nova na mestre nasce na seguidora com estoque 0 e o custo da mestre como ponto de partida.
-- Desativar na mestre desativa na seguidora só se ela estiver sem estoque. Excluir não é replicado.

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

-- Qual peça da seguidora corresponde a qual peça da mestre (sobrevive a renomear e trocar código)
create table if not exists public.catalog_part_map (
  master_part_id       uuid not null references public.workshop_parts(id) on delete cascade,
  follower_workshop_id uuid not null references public.workshops(id) on delete cascade,
  follower_part_id     uuid not null references public.workshop_parts(id) on delete cascade,
  primary key (master_part_id, follower_workshop_id)
);
create index if not exists catalog_part_map_follower_idx on public.catalog_part_map (follower_part_id);
alter table public.catalog_part_map enable row level security;

-- Jota Car → JC Pneus, Check All, Check All 2
insert into public.catalog_links (master_workshop_id, follower_workshop_id)
select m.id, f.id from public.workshops m, public.workshops f
 where m.business_name = 'Jota Car' and f.business_name in ('JC Pneus', 'Check All', 'Check All 2')
on conflict do nothing;

-- Copia uma peça da mestre para todas as seguidoras (e, opcionalmente, os carros)
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
begin
  select * into _m from workshop_parts where id = p_master_part;
  if _m.id is null then return; end if;

  for _l in select follower_workshop_id as wid from catalog_links where master_workshop_id = _m.workshop_id and active loop
    _fid := null;
    select follower_part_id into _fid from catalog_part_map where master_part_id = _m.id and follower_workshop_id = _l.wid;
    if _fid is not null and not exists (select 1 from workshop_parts where id = _fid) then _fid := null; end if;

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
      insert into workshop_parts (workshop_id, name, code, brand, unit, supplier, cost, margin_percent, sale_price,
                                  active, stock_qty, min_qty, category, subcategory, universal)
      values (_l.wid, _m.name, _m.code, _m.brand, _m.unit, _m.supplier, _m.cost, _m.margin_percent, _m.sale_price,
              true, 0, 0, _m.category, _m.subcategory, _m.universal)
      returning id into _fid;
    else
      select * into _f from workshop_parts where id = _fid;
      update workshop_parts
         set name = _m.name, code = _m.code, brand = _m.brand, unit = _m.unit, category = _m.category,
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
  after insert or update of name, code, brand, unit, category, subcategory, universal, margin_percent, sale_price, active
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

-- Acerto geral: copia o cadastro inteiro da mestre para as seguidoras (rodar uma vez, e quando incluir uma loja nova)
create or replace function public.catalog_sync_all(p_master uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare _p record; _n int := 0;
begin
  for _p in
    select p.id from workshop_parts p
     where p.workshop_id in (select master_workshop_id from catalog_links where active and (p_master is null or master_workshop_id = p_master))
     order by p.created_at
  loop
    perform catalog_sync_part(_p.id, true);
    _n := _n + 1;
  end loop;
  return _n;
end;
$$;

revoke all on function public.catalog_sync_part(uuid, boolean) from public, anon, authenticated;
revoke all on function public.catalog_sync_all(uuid) from public, anon, authenticated;
revoke all on function public.trg_catalog_part() from public, anon, authenticated;
revoke all on function public.trg_catalog_vehicle() from public, anon, authenticated;
