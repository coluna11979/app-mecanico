-- Comissão digitada no item: o caixa escolhe quem fez o serviço e já define quanto ele ganha naquele item.
-- service_order_items.commission_amount (só na linha do serviço/mão de obra): R$ que SUBSTITUI a regra
-- (4% serviço + peças · 10% mão de obra · regras por item) só para esse serviço e as peças dele.
-- Null = segue a regra. A comissão manual da OS inteira (commission_manual, 0066) continua mandando em tudo.
-- Vale para trabalho na regra atual (rule_v2). Na view, o valor entra na coluna "manual" de quem fez.

alter table public.service_order_items
  add column if not exists commission_amount numeric check (commission_amount is null or commission_amount >= 0);

comment on column public.service_order_items.commission_amount is
  'Só serviços: comissão em R$ definida na OS para quem fez este serviço (substitui 4%/10%/regras deste serviço e das peças dele). Null = regra';

create or replace view public.os_commission_base with (security_invoker = true) as
with fin as (
  select service_order_id, coalesce(workshop_mechanic_id::text, executor) as rkey,
         max(ended_at) filter (where finished) as finished_at,
         bool_or(ended_at is null) as has_open
    from public.service_order_work_logs
   group by 1, 2
),
b as (
  select i.id, i.service_order_id, i.workshop_id, i.kind, i.description, i.quantity, i.unit_price, i.position,
         i.created_at, i.workshop_mechanic_id, i.executor, i.used_in_item_id, i.service_type,
         so.workshop_mechanic_id as os_mech,
         count(*) filter (where i.kind = 'labor') over (partition by i.service_order_id order by i.position, i.created_at, i.id) as g
    from public.service_order_items i
    join public.service_orders so on so.id = i.service_order_id
),
s1 as (
  select b.*,
         case when b.kind = 'labor' then b.id else coalesce(lk.id, gl.id) end as svc_id,
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
  select s1.service_order_id, s1.id as item_id, s1.svc_id, s1.kind, s1.quantity, s1.unit_price, s1.description,
         s1.workshop_id as item_ws,
         case
           when s1.kind = 'part' and s1.link_id is not null then
             case when s1.link_exec = 'platform' then null else coalesce(s1.link_mech, s1.os_mech) end
           when s1.executor = 'platform' then null
           else coalesce(s1.workshop_mechanic_id, s1.os_mech)
         end as old_mech,
         case when sv.id is null or sv.executor = 'platform' then null
              else coalesce(sv.workshop_mechanic_id, s1.os_mech) end as new_mech,
         case when sv.id is null then null
              when sv.executor = 'platform' then 'platform'
              else coalesce(sv.workshop_mechanic_id, s1.os_mech)::text end as rkey,
         case when sv.id is null then null
              else coalesce(sv.service_type, case when coalesce(np.nparts, 0) > 0 then 'servico' else 'mao_de_obra' end) end as eff_type,
         sv.commission_amount as grp_amt
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
ruled0 as (
  select d.*,
         (coalesce(d.done_at, now()) >= timestamptz '2026-10-01 03:00:00+00' or d.source = 'paper_import') as v2,
         translate(lower(d.description), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') as dnorm
    from dated d
),
ruled as (
  select r.*,
         -- valor digitado no serviço (regra atual) substitui a regra desse serviço e das peças dele
         (r.v2 and r.grp_amt is not null) as item_manual,
         exists (select 1 from public.commission_item_rules cr
                  where cr.workshop_id = r.item_ws and cr.active
                    and r.dnorm like '%' || translate(lower(cr.keyword), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') || '%') as excl,
         coalesce((select max(floor(r.quantity / greatest(cr.per_units, 1)) * cr.amount)
                     from public.commission_item_rules cr
                    where cr.workshop_id = r.item_ws and cr.active and cr.amount > 0
                      and cr.mechanic_id = case when r.v2 then r.new_mech else r.old_mech end
                      and r.dnorm like '%' || translate(lower(cr.keyword), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') || '%'), 0) as fixed_amt
    from ruled0 r
)
select so.id as service_order_id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       case when r.v2 then r.new_mech else r.old_mech end as mechanic_id,
       round(coalesce(sum(r.quantity * r.unit_price) filter (where r.kind = 'labor'), 0), 2) as labor,
       round(coalesce(sum(r.quantity * r.unit_price) filter (where r.kind = 'part'),  0), 2) as parts,
       so.customer_brought_parts,
       0::numeric as labor_only,
       r.done_at,
       r.v2 as rule_v2,
       round(coalesce(sum(r.quantity * r.unit_price) filter (
         where r.v2 and not r.excl and not r.item_manual and r.eff_type = 'servico' and not so.customer_brought_parts), 0), 2) as svc_base,
       round(coalesce(sum(r.quantity * r.unit_price) filter (
         where r.v2 and not r.excl and not r.item_manual and r.kind = 'labor' and (r.eff_type = 'mao_de_obra' or so.customer_brought_parts)), 0), 2) as mo_base,
       -- comissão digitada no serviço (conta uma vez, na linha do próprio serviço)
       round(coalesce(sum(r.grp_amt) filter (where r.item_manual and r.item_id = r.svc_id), 0), 2) as manual,
       round(coalesce(sum(r.fixed_amt) filter (where not r.item_manual), 0), 2) as fixed
  from public.service_orders so
  join ruled r on r.service_order_id = so.id
 where not so.commission_manual
 group by so.id, case when r.v2 then r.new_mech else r.old_mech end, r.done_at, r.v2
union all
select so.id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       so.workshop_mechanic_id, coalesce(so.labor_cost, 0), coalesce(so.parts_cost, 0),
       so.customer_brought_parts, 0::numeric,
       case when so.status = 'completed' and so.quote_status is null then so.completed_at end,
       false, 0::numeric, 0::numeric, 0::numeric, 0::numeric
  from public.service_orders so
 where not so.commission_manual
   and not exists (select 1 from public.service_order_items i where i.service_order_id = so.id)
   and (coalesce(so.labor_cost, 0) > 0 or coalesce(so.parts_cost, 0) > 0)
union all
select so.id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       o.mechanic_id, 0::numeric, 0::numeric, so.customer_brought_parts, 0::numeric,
       case when so.status = 'completed' and so.quote_status is null then so.completed_at end,
       true, 0::numeric, 0::numeric, o.amount, 0::numeric
  from public.os_commission_overrides o
  join public.service_orders so on so.id = o.service_order_id
 where so.commission_manual;
