-- Peças × veículos: em quais carros cada peça serve (marca + modelo, ano opcional).
-- Ano em branco = serve em qualquer ano. Uma peça pode ter vários veículos.

create table if not exists public.workshop_part_vehicles (
  id          uuid primary key default uuid_generate_v4(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  part_id     uuid not null references public.workshop_parts(id) on delete cascade,
  brand       text not null check (length(trim(brand)) > 0),
  model       text not null check (length(trim(model)) > 0),
  year_from   int check (year_from between 1950 and 2100),
  year_to     int check (year_to between 1950 and 2100),
  created_at  timestamptz not null default now(),
  check (year_to is null or year_from is null or year_to >= year_from)
);

create index if not exists workshop_part_vehicles_part_idx on public.workshop_part_vehicles (part_id);
create index if not exists workshop_part_vehicles_lookup_idx on public.workshop_part_vehicles (workshop_id, lower(brand), lower(model));

alter table public.workshop_part_vehicles enable row level security;
drop policy if exists workshop_part_vehicles_members on public.workshop_part_vehicles;
create policy workshop_part_vehicles_members on public.workshop_part_vehicles
  for all
  using      (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));
