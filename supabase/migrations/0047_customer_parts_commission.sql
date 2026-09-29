-- Cliente trouxe a peça: a mão de obra dessa OS paga uma % própria ao colaborador
-- (ex.: 10% da mão de obra cobrada), já que não há venda de peça.
alter table public.service_orders
  add column if not exists customer_brought_parts boolean not null default false;

alter table public.workshop_mechanics
  add column if not exists commission_own_parts_percent numeric
    check (commission_own_parts_percent between 0 and 100);
comment on column public.workshop_mechanics.commission_own_parts_percent is
  '% sobre a mão de obra quando o cliente traz a peça; null = usa commission_percent';

-- Mesma view da 0046 + se a OS é de peça trazida pelo cliente (coluna nova no fim)
create or replace view public.os_commission_base with (security_invoker = true) as
select so.id as service_order_id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       coalesce(i.workshop_mechanic_id, so.workshop_mechanic_id) as mechanic_id,
       round(coalesce(sum(i.quantity * i.unit_price) filter (where i.kind = 'labor'), 0), 2) as labor,
       round(coalesce(sum(i.quantity * i.unit_price) filter (where i.kind = 'part'),  0), 2) as parts,
       so.customer_brought_parts
  from public.service_orders so
  join public.service_order_items i on i.service_order_id = so.id
 group by so.id, coalesce(i.workshop_mechanic_id, so.workshop_mechanic_id)
union all
select so.id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       so.workshop_mechanic_id, coalesce(so.labor_cost, 0), coalesce(so.parts_cost, 0),
       so.customer_brought_parts
  from public.service_orders so
 where not exists (select 1 from public.service_order_items i where i.service_order_id = so.id)
   and (coalesce(so.labor_cost, 0) > 0 or coalesce(so.parts_cost, 0) > 0);
