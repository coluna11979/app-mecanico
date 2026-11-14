-- Consulta técnica: qual óleo, quanto e quais filtros cada carro usa.
-- Base GLOBAL (não é por oficina), montada por nós a partir de fonte pública (manual da montadora,
-- catálogo de aplicação do fabricante). Cada linha guarda a fonte e o status:
-- 'rascunho' só o admin vê; 'verificado' aparece para as oficinas com o módulo ligado.

create table if not exists public.tech_vehicles (
  id           uuid primary key default uuid_generate_v4(),
  make         text not null check (length(trim(make)) > 0),
  model        text not null check (length(trim(model)) > 0),
  version      text,                       -- "LTZ 1.8 16V Flexpower"
  engine       text,                       -- "1.8 16V Ecotec"
  fuel         text,                       -- flex, gasolina, diesel, híbrido…
  transmission text,                       -- manual, automático, CVT…
  year_from    int check (year_from between 1950 and 2100),
  year_to      int check (year_to between 1950 and 2100),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (year_to is null or year_from is null or year_to >= year_from)
);
create index if not exists tech_vehicles_lookup_idx on public.tech_vehicles (lower(model), lower(make));

create table if not exists public.tech_fluid_specs (
  id              uuid primary key default uuid_generate_v4(),
  vehicle_id      uuid not null references public.tech_vehicles(id) on delete cascade,
  system          text not null check (system in ('motor', 'cambio', 'diferencial', 'direcao', 'freio', 'arrefecimento')),
  viscosity       text,                    -- "5W30", "75W85", "DOT 4"
  spec            text,                    -- "API SL", "Dexos 1", "ATF Dexron VI"
  capacity_liters numeric check (capacity_liters > 0),   -- com troca de filtro, quando se aplica
  interval_km     int check (interval_km > 0),
  interval_months int check (interval_months > 0),
  notes           text,
  source_url      text,
  status          text not null default 'rascunho' check (status in ('rascunho', 'verificado')),
  verified_by     uuid references auth.users(id) on delete set null,
  verified_at     timestamptz,
  position        int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists tech_fluid_specs_vehicle_idx on public.tech_fluid_specs (vehicle_id, position);

create table if not exists public.tech_filter_refs (
  id          uuid primary key default uuid_generate_v4(),
  vehicle_id  uuid not null references public.tech_vehicles(id) on delete cascade,
  kind        text not null check (kind in ('oleo', 'ar', 'combustivel', 'cabine')),
  brand       text not null check (length(trim(brand)) > 0),
  code        text not null check (length(trim(code)) > 0),
  notes       text,
  source_url  text,
  status      text not null default 'rascunho' check (status in ('rascunho', 'verificado')),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists tech_filter_refs_vehicle_idx on public.tech_filter_refs (vehicle_id, kind, position);

-- O que as oficinas buscaram (achando ou não): vira a fila de prioridade do admin
create table if not exists public.tech_lookup_log (
  id          uuid primary key default uuid_generate_v4(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  query       text not null,
  year        int,
  vehicle_id  uuid references public.tech_vehicles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists tech_lookup_log_created_idx on public.tech_lookup_log (created_at desc);

-- "Informação errada?" — a oficina avisa, o admin confere
create table if not exists public.tech_feedback (
  id          uuid primary key default uuid_generate_v4(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  vehicle_id  uuid not null references public.tech_vehicles(id) on delete cascade,
  message     text not null check (length(trim(message)) > 0),
  created_by  uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- A versão/motor escolhida fica no carro do cliente: na próxima visita abre a ficha direto
alter table public.vehicles
  add column if not exists tech_vehicle_id uuid references public.tech_vehicles(id) on delete set null;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.tech_vehicles    enable row level security;
alter table public.tech_fluid_specs enable row level security;
alter table public.tech_filter_refs enable row level security;
alter table public.tech_lookup_log  enable row level security;
alter table public.tech_feedback    enable row level security;

-- Linhas: oficina só lê o que foi verificado; admin faz tudo
drop policy if exists tech_fluid_specs_read on public.tech_fluid_specs;
create policy tech_fluid_specs_read on public.tech_fluid_specs
  for select to authenticated using (status = 'verificado' or is_admin(auth.uid()));
drop policy if exists tech_fluid_specs_admin on public.tech_fluid_specs;
create policy tech_fluid_specs_admin on public.tech_fluid_specs
  for all using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists tech_filter_refs_read on public.tech_filter_refs;
create policy tech_filter_refs_read on public.tech_filter_refs
  for select to authenticated using (status = 'verificado' or is_admin(auth.uid()));
drop policy if exists tech_filter_refs_admin on public.tech_filter_refs;
create policy tech_filter_refs_admin on public.tech_filter_refs
  for all using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- Veículo: a oficina só enxerga quem já tem alguma linha verificada
drop policy if exists tech_vehicles_read on public.tech_vehicles;
create policy tech_vehicles_read on public.tech_vehicles
  for select to authenticated using (
    is_admin(auth.uid())
    or exists (select 1 from public.tech_fluid_specs s where s.vehicle_id = tech_vehicles.id and s.status = 'verificado')
    or exists (select 1 from public.tech_filter_refs f where f.vehicle_id = tech_vehicles.id and f.status = 'verificado')
  );
drop policy if exists tech_vehicles_admin on public.tech_vehicles;
create policy tech_vehicles_admin on public.tech_vehicles
  for all using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- Log e avisos: a oficina grava os seus; só o admin lê e resolve
drop policy if exists tech_lookup_log_insert on public.tech_lookup_log;
create policy tech_lookup_log_insert on public.tech_lookup_log
  for insert with check (is_workshop_member(workshop_id, auth.uid()));
drop policy if exists tech_lookup_log_admin on public.tech_lookup_log;
create policy tech_lookup_log_admin on public.tech_lookup_log
  for all using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists tech_feedback_insert on public.tech_feedback;
create policy tech_feedback_insert on public.tech_feedback
  for insert with check (is_workshop_member(workshop_id, auth.uid()));
drop policy if exists tech_feedback_admin on public.tech_feedback;
create policy tech_feedback_admin on public.tech_feedback
  for all using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- ── Fila do admin: o que falta cadastrar ───────────────────────────────────
-- Modelos que as oficinas atendem (cadastro de carros) e o que foi buscado sem achar,
-- tirando o que já tem ficha. Só admin.
create or replace function public.tech_missing_models()
returns table (make text, model text, cars bigint, lookups bigint)
language sql stable security definer set search_path = public as $$
  with cars as (
    select lower(trim(v.model)) as k, min(trim(v.make)) as make, min(trim(v.model)) as model, count(*) as n
    from vehicles v
    where length(trim(coalesce(v.model, ''))) > 0
    group by 1
  ), looks as (
    select lower(trim(l.query)) as k, min(trim(l.query)) as model, count(*) as n
    from tech_lookup_log l
    where l.vehicle_id is null
    group by 1
  ), merged as (
    select coalesce(c.k, l.k) as k, c.make, coalesce(c.model, l.model) as model,
           coalesce(c.n, 0) as cars, coalesce(l.n, 0) as lookups
    from cars c full join looks l on l.k = c.k
  )
  select m.make, m.model, m.cars, m.lookups
  from merged m
  where is_admin(auth.uid())
    and not exists (select 1 from tech_vehicles t where lower(trim(t.model)) = m.k)
  order by m.lookups desc, m.cars desc
  limit 300;
$$;

revoke all on function public.tech_missing_models() from public, anon;
grant execute on function public.tech_missing_models() to authenticated;
