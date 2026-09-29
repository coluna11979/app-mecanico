-- Comissão por item da OS e comissão sobre peças / faturamento.
-- 1) Cada item da OS (serviço ou peça) pode ter quem fez; vazio = responsável da OS.
--    Ex.: troca de pneus = João, cambagem e balanceamento = Pedro — cada um ganha sobre o que fez.
-- 2) Cada colaborador tem três % que se somam (0 = não ganha naquela base):
--    commission_percent          → sobre os serviços (mão de obra) que fez  (já existia)
--    commission_parts_percent    → sobre as peças dos itens que fez
--    commission_revenue_percent  → sobre o faturamento total da loja (ex.: gerente 1,5%)

alter table public.service_order_items
  add column if not exists workshop_mechanic_id uuid references public.workshop_mechanics(id) on delete set null;
create index if not exists service_order_items_mechanic_idx on public.service_order_items (workshop_mechanic_id)
  where workshop_mechanic_id is not null;

-- O colaborador do item tem que ser da mesma oficina
create or replace function public.trg_os_item_mechanic_check()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.workshop_mechanic_id is not null and not exists (
    select 1 from workshop_mechanics m where m.id = new.workshop_mechanic_id and m.workshop_id = new.workshop_id
  ) then
    raise exception 'Colaborador não pertence a esta oficina';
  end if;
  return new;
end $$;

drop trigger if exists trg_os_item_mechanic_check on public.service_order_items;
create trigger trg_os_item_mechanic_check before insert or update of workshop_mechanic_id, workshop_id
  on public.service_order_items for each row execute function public.trg_os_item_mechanic_check();

alter table public.workshop_mechanics
  add column if not exists commission_parts_percent   numeric not null default 0
    check (commission_parts_percent between 0 and 100),
  add column if not exists commission_revenue_percent numeric not null default 0
    check (commission_revenue_percent between 0 and 100);

-- Base de comissão de cada OS dividida por quem fez cada item.
-- OS antiga sem itens: os valores digitados ficam com o responsável da OS.
create or replace view public.os_commission_base with (security_invoker = true) as
select so.id as service_order_id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       coalesce(i.workshop_mechanic_id, so.workshop_mechanic_id) as mechanic_id,
       round(coalesce(sum(i.quantity * i.unit_price) filter (where i.kind = 'labor'), 0), 2) as labor,
       round(coalesce(sum(i.quantity * i.unit_price) filter (where i.kind = 'part'),  0), 2) as parts
  from public.service_orders so
  join public.service_order_items i on i.service_order_id = so.id
 group by so.id, coalesce(i.workshop_mechanic_id, so.workshop_mechanic_id)
union all
select so.id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       so.workshop_mechanic_id, coalesce(so.labor_cost, 0), coalesce(so.parts_cost, 0)
  from public.service_orders so
 where not exists (select 1 from public.service_order_items i where i.service_order_id = so.id)
   and (coalesce(so.labor_cost, 0) > 0 or coalesce(so.parts_cost, 0) > 0);

grant select on public.os_commission_base to authenticated;
