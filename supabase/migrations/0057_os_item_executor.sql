-- "Quem fez" por item também pode ser o mecânico da plataforma: na mesma OS, um serviço
-- é feito pela equipe e outro por um autônomo chamado pela plataforma.
alter table public.service_order_items
  add column if not exists executor text check (executor in ('workshop', 'platform'));

comment on column public.service_order_items.executor is
  'platform = item feito por mecânico da plataforma (não gera comissão para a equipe); null/workshop = equipe (workshop_mechanic_id ou responsável da OS)';

-- Mesma view da 0047; item da plataforma fica sem colaborador (fora da comissão da equipe)
create or replace view public.os_commission_base with (security_invoker = true) as
select so.id as service_order_id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       case when i.executor = 'platform' then null
            else coalesce(i.workshop_mechanic_id, so.workshop_mechanic_id) end as mechanic_id,
       round(coalesce(sum(i.quantity * i.unit_price) filter (where i.kind = 'labor'), 0), 2) as labor,
       round(coalesce(sum(i.quantity * i.unit_price) filter (where i.kind = 'part'),  0), 2) as parts,
       so.customer_brought_parts
  from public.service_orders so
  join public.service_order_items i on i.service_order_id = so.id
 group by so.id, case when i.executor = 'platform' then null
                      else coalesce(i.workshop_mechanic_id, so.workshop_mechanic_id) end
union all
select so.id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       so.workshop_mechanic_id, coalesce(so.labor_cost, 0), coalesce(so.parts_cost, 0),
       so.customer_brought_parts
  from public.service_orders so
 where not exists (select 1 from public.service_order_items i where i.service_order_id = so.id)
   and (coalesce(so.labor_cost, 0) > 0 or coalesce(so.parts_cost, 0) > 0);
