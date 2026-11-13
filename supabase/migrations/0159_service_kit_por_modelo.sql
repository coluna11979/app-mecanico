-- Kit de peças por modelo de carro: o mesmo serviço pode ter um kit diferente por modelo
-- (troca de óleo do Onix ≠ da Hilux). vehicle_model vazio = kit geral, vale para todos os carros.
-- Na OS: se existe kit para o modelo do carro, ele substitui o geral.
alter table public.workshop_service_parts
  add column if not exists vehicle_model text;

alter table public.workshop_service_parts
  drop constraint if exists workshop_service_parts_model_not_blank;
alter table public.workshop_service_parts
  add constraint workshop_service_parts_model_not_blank
  check (vehicle_model is null or length(trim(vehicle_model)) > 0);

create index if not exists workshop_service_parts_service_model_idx
  on public.workshop_service_parts (service_id, vehicle_model, position);
