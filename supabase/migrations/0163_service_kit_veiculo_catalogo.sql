-- Kit de peças por carro do catálogo técnico: marca, modelo, versão/motor e faixa de anos.
-- Antes o kit era por "modelo" em texto livre (0159). Agora pode apontar para uma ficha do catálogo técnico
-- (tech_vehicles): na OS, o kit certo sai do carro (tech_vehicle_id do veículo) ou do modelo + ano do carro.
-- vehicle_model continua sendo o nome do modelo, então os kits antigos seguem valendo (sem ano = qualquer ano).
alter table public.workshop_service_parts
  add column if not exists tech_vehicle_id uuid references public.tech_vehicles(id) on delete set null,
  add column if not exists vehicle_make    text,
  add column if not exists vehicle_engine  text,
  add column if not exists year_from       int check (year_from between 1950 and 2100),
  add column if not exists year_to         int check (year_to between 1950 and 2100);

create index if not exists workshop_service_parts_tech_vehicle_idx
  on public.workshop_service_parts (service_id, tech_vehicle_id);
