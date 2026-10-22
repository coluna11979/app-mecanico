-- Comissão conta quando o SERVIÇO é finalizado (não precisa estar pago nem a OS inteira concluída).
-- Dois mecânicos no mesmo carro: quem deu "Terminou" no seu relógio (service_order_work_logs.finished)
-- já entra na comissão naquela hora. Sem relógio finalizado, vale a conclusão da OS (completed_at).
-- OS cancelada ou orçamento recusado não conta (done_at nulo).
-- O fechamento quinzenal (commission_closings) e o Financeiro filtram por done_at.

create or replace view public.os_commission_base with (security_invoker = true) as
with fin as (
  -- Finalização de cada responsável na OS (reaberto = trecho aberto → ainda não terminou)
  select service_order_id, coalesce(workshop_mechanic_id::text, executor) as rkey,
         max(ended_at) filter (where finished) as finished_at,
         bool_or(ended_at is null) as has_open
    from public.service_order_work_logs
   group by 1, 2
),
it as (
  select i.service_order_id, i.id as item_id, i.kind, i.quantity, i.unit_price,
         case
           when i.kind = 'part' and li.id is not null then
             case when li.executor = 'platform' then null
                  else coalesce(li.workshop_mechanic_id, so.workshop_mechanic_id) end
           when i.executor = 'platform' then null
           else coalesce(i.workshop_mechanic_id, so.workshop_mechanic_id)
         end as mechanic_id,
         case
           when i.kind = 'part' and li.id is not null then
             case when li.executor = 'platform' then 'platform'
                  else coalesce(li.workshop_mechanic_id, so.workshop_mechanic_id)::text end
           when i.executor = 'platform' then 'platform'
           else coalesce(i.workshop_mechanic_id, so.workshop_mechanic_id)::text
         end as rkey
    from public.service_order_items i
    join public.service_orders so on so.id = i.service_order_id
    left join public.service_order_items li on li.id = i.used_in_item_id and li.service_order_id = i.service_order_id
),
dated as (
  select it.*,
         case
           when so.status = 'cancelled' or so.quote_status is not null then null
           when f.finished_at is not null and not f.has_open then f.finished_at
           when so.status = 'completed' then so.completed_at
         end as done_at
    from it
    join public.service_orders so on so.id = it.service_order_id
    left join fin f on f.service_order_id = it.service_order_id and f.rkey = it.rkey
)
select so.id as service_order_id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       d.mechanic_id,
       round(coalesce(sum(d.quantity * d.unit_price) filter (where d.kind = 'labor'), 0), 2) as labor,
       round(coalesce(sum(d.quantity * d.unit_price) filter (where d.kind = 'part'),  0), 2) as parts,
       so.customer_brought_parts,
       round(coalesce(sum(d.quantity * d.unit_price) filter (
         where d.kind = 'labor'
           and coalesce(d.done_at, now()) >= timestamptz '2026-10-01 00:00:00-03'
           and not exists (select 1 from public.service_order_items p where p.used_in_item_id = d.item_id and p.kind = 'part')
       ), 0), 2) as labor_only,
       d.done_at
  from public.service_orders so
  join dated d on d.service_order_id = so.id
 group by so.id, d.mechanic_id, d.done_at
union all
select so.id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       so.workshop_mechanic_id, coalesce(so.labor_cost, 0), coalesce(so.parts_cost, 0),
       so.customer_brought_parts, 0::numeric,
       case when so.status = 'completed' and so.quote_status is null then so.completed_at end
  from public.service_orders so
 where not exists (select 1 from public.service_order_items i where i.service_order_id = so.id)
   and (coalesce(so.labor_cost, 0) > 0 or coalesce(so.parts_cost, 0) > 0);
