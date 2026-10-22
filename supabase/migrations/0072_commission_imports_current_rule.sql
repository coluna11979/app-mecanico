-- Comissão: duas correções pedidas pela loja.
-- 1) Notas importadas (source = 'paper_import') usam SEMPRE a regra atual (4% serviço + peças · 10% mão de obra),
--    qualquer que seja a data da nota. OS do sistema antes de 01/10/2026 continuam com a % da ficha.
-- 2) Peças lançadas ANTES do primeiro serviço da OS pertencem a esse primeiro serviço
--    (nas notas é comum listar as peças e o serviço por último). Antes ficavam sem serviço e sem comissão.

create or replace view public.os_commission_base with (security_invoker = true) as
with fin as (
  select service_order_id, coalesce(workshop_mechanic_id::text, executor) as rkey,
         max(ended_at) filter (where finished) as finished_at,
         bool_or(ended_at is null) as has_open
    from public.service_order_work_logs
   group by 1, 2
),
b as (
  -- g = nº do serviço (linha labor) ao qual o item pertence pela ordem; 0 = antes de qualquer serviço
  select i.*, so.workshop_mechanic_id as os_mech,
         count(*) filter (where i.kind = 'labor') over (partition by i.service_order_id order by i.position, i.created_at, i.id) as g
    from public.service_order_items i
    join public.service_orders so on so.id = i.service_order_id
),
s1 as (
  -- svc_id = serviço do item (o próprio, se labor; peça: link explícito, senão pela ordem)
  select b.*,
         case when b.kind = 'labor' then b.id
              else coalesce(lk.id, gl.id) end as svc_id,
         lk.id as link_id, lk.executor as link_exec, lk.workshop_mechanic_id as link_mech
    from b
    left join public.service_order_items lk
      on lk.id = b.used_in_item_id and lk.service_order_id = b.service_order_id and lk.kind = 'labor'
    left join b gl
      on b.kind = 'part' and gl.service_order_id = b.service_order_id and gl.kind = 'labor' and gl.g = greatest(b.g, 1)
),
np as (
  select svc_id, count(*) filter (where kind = 'part') as nparts from s1 where svc_id is not null group by 1
),
it as (
  select s1.service_order_id, s1.id as item_id, s1.kind, s1.quantity, s1.unit_price,
         -- regra antiga (0061): quem leva o item
         case
           when s1.kind = 'part' and s1.link_id is not null then
             case when s1.link_exec = 'platform' then null else coalesce(s1.link_mech, s1.os_mech) end
           when s1.executor = 'platform' then null
           else coalesce(s1.workshop_mechanic_id, s1.os_mech)
         end as old_mech,
         -- regra nova: quem fez o serviço do grupo
         case when sv.id is null or sv.executor = 'platform' then null
              else coalesce(sv.workshop_mechanic_id, s1.os_mech) end as new_mech,
         case when sv.id is null then null
              when sv.executor = 'platform' then 'platform'
              else coalesce(sv.workshop_mechanic_id, s1.os_mech)::text end as rkey,
         case when sv.id is null then null
              else coalesce(sv.service_type, case when coalesce(np.nparts, 0) > 0 then 'servico' else 'mao_de_obra' end) end as eff_type
    from s1
    left join public.service_order_items sv on sv.id = s1.svc_id
    left join np on np.svc_id = s1.svc_id
),
dated as (
  select it.*, so.source,
         case
           when so.status = 'cancelled' or so.quote_status is not null then null
           when f.finished_at is not null and not f.has_open then f.finished_at
           when so.status = 'completed' then so.completed_at
         end as done_at
    from it
    join public.service_orders so on so.id = it.service_order_id
    left join fin f on f.service_order_id = it.service_order_id and f.rkey = it.rkey
),
ruled as (
  select d.*,
         (coalesce(d.done_at, now()) >= timestamptz '2026-10-01 00:00:00-03' or d.source = 'paper_import') as v2
    from dated d
)
select so.id as service_order_id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       case when r.v2 then r.new_mech else r.old_mech end as mechanic_id,
       round(coalesce(sum(r.quantity * r.unit_price) filter (where r.kind = 'labor'), 0), 2) as labor,
       round(coalesce(sum(r.quantity * r.unit_price) filter (where r.kind = 'part'),  0), 2) as parts,
       so.customer_brought_parts,
       0::numeric as labor_only,
       r.done_at,
       r.v2 as rule_v2,
       -- 4%: serviço + peças dele (cliente trouxe a peça → o serviço vira mão de obra)
       round(coalesce(sum(r.quantity * r.unit_price) filter (
         where r.v2 and r.eff_type = 'servico' and not so.customer_brought_parts), 0), 2) as svc_base,
       -- 10%: mão de obra (serviço sem peça)
       round(coalesce(sum(r.quantity * r.unit_price) filter (
         where r.v2 and r.kind = 'labor' and (r.eff_type = 'mao_de_obra' or so.customer_brought_parts)), 0), 2) as mo_base,
       0::numeric as manual
  from public.service_orders so
  join ruled r on r.service_order_id = so.id
 where not so.commission_manual
 group by so.id, case when r.v2 then r.new_mech else r.old_mech end, r.done_at, r.v2
union all
select so.id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       so.workshop_mechanic_id, coalesce(so.labor_cost, 0), coalesce(so.parts_cost, 0),
       so.customer_brought_parts, 0::numeric,
       case when so.status = 'completed' and so.quote_status is null then so.completed_at end,
       false, 0::numeric, 0::numeric, 0::numeric
  from public.service_orders so
 where not so.commission_manual
   and not exists (select 1 from public.service_order_items i where i.service_order_id = so.id)
   and (coalesce(so.labor_cost, 0) > 0 or coalesce(so.parts_cost, 0) > 0)
union all
-- Comissão definida à mão na OS: substitui a regra para aquela OS (vale quando a OS é concluída)
select so.id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       o.mechanic_id, 0::numeric, 0::numeric, so.customer_brought_parts, 0::numeric,
       case when so.status = 'completed' and so.quote_status is null then so.completed_at end,
       true, 0::numeric, 0::numeric, o.amount
  from public.os_commission_overrides o
  join public.service_orders so on so.id = o.service_order_id
 where so.commission_manual;
