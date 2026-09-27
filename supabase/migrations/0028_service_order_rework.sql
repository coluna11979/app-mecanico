-- Retorno / garantia: a OS nova aponta para a OS original que "voltou".
-- Base do indicador de QUALIDADE por mecânico (taxa de retorno).
--
-- rework_cause:
--   execution  = falha na execução        → conta contra o mecânico
--   diagnosis  = diagnóstico errado        → conta contra o mecânico
--   part       = peça com defeito          → não conta (fornecedor)
--   customer   = mau uso / problema novo   → não conta
--   other      = outro                     → não conta
--   null       = ainda não avaliado

alter table public.service_orders
  add column if not exists rework_of_id uuid references public.service_orders(id) on delete set null,
  add column if not exists rework_cause text
    check (rework_cause in ('execution', 'diagnosis', 'part', 'customer', 'other')),
  add column if not exists rework_mechanic_id uuid references public.workshop_mechanics(id) on delete set null,
  add column if not exists rework_notes text;

create index if not exists service_orders_rework_of_idx on public.service_orders(rework_of_id) where rework_of_id is not null;

-- Garante mesma oficina e preenche o responsável pelo serviço original
create or replace function public.service_order_rework_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  orig record;
begin
  if new.rework_of_id is null then
    new.rework_cause := null;
    new.rework_mechanic_id := null;
    return new;
  end if;
  if new.rework_of_id = new.id then
    raise exception 'Uma OS não pode ser retorno dela mesma';
  end if;
  select workshop_id, workshop_mechanic_id into orig from public.service_orders where id = new.rework_of_id;
  if orig is null or orig.workshop_id <> new.workshop_id then
    raise exception 'OS original não pertence a esta oficina';
  end if;
  if new.rework_mechanic_id is null and (tg_op = 'INSERT' or old.rework_of_id is distinct from new.rework_of_id) then
    new.rework_mechanic_id := orig.workshop_mechanic_id;
  end if;
  if new.rework_mechanic_id is not null and not exists (
    select 1 from public.workshop_mechanics where id = new.rework_mechanic_id and workshop_id = new.workshop_id
  ) then
    raise exception 'Mecânico não pertence a esta oficina';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_order_rework_guard on public.service_orders;
create trigger trg_service_order_rework_guard
  before insert or update of rework_of_id, rework_mechanic_id, rework_cause on public.service_orders
  for each row execute function public.service_order_rework_guard();
