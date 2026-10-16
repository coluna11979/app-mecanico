-- Regra de comissão única para todas as lojas (trabalho finalizado a partir de 01/10/2026):
--   "Mão de obra" (serviço sem peça)          → 10% do valor, para quem fez
--   "Serviço" + as peças logo abaixo dele      → 4% sobre a soma, para quem fez o serviço
-- A peça pertence ao serviço imediatamente acima dela na OS (ordem dos itens), até a próxima linha de
-- serviço/mão de obra — ou ao serviço indicado em used_in_item_id. Peça sem serviço acima ou abaixo de uma
-- "Mão de obra" não gera comissão. Serviço da plataforma não gera comissão para a equipe.
-- A % sobre o faturamento da ficha (gerente) continua. Antes de 01/10/2026 tudo fica como era (% de cada ficha).

alter table public.service_order_items
  add column if not exists service_type text check (service_type in ('servico', 'mao_de_obra'));

comment on column public.service_order_items.service_type is
  'Só itens labor: servico = leva peças (4% sobre serviço + peças) · mao_de_obra = sem peça (10%). Null = pela ordem (tem peça abaixo → servico)';

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
      on b.kind = 'part' and gl.service_order_id = b.service_order_id and gl.kind = 'labor' and gl.g = b.g
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
  select it.*,
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
         coalesce(d.done_at, now()) >= timestamptz '2026-10-01 00:00:00-03' as v2
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
         where r.v2 and r.kind = 'labor' and (r.eff_type = 'mao_de_obra' or so.customer_brought_parts)), 0), 2) as mo_base
  from public.service_orders so
  join ruled r on r.service_order_id = so.id
 group by so.id, case when r.v2 then r.new_mech else r.old_mech end, r.done_at, r.v2
union all
select so.id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       so.workshop_mechanic_id, coalesce(so.labor_cost, 0), coalesce(so.parts_cost, 0),
       so.customer_brought_parts, 0::numeric,
       case when so.status = 'completed' and so.quote_status is null then so.completed_at end,
       false, 0::numeric, 0::numeric
  from public.service_orders so
 where not exists (select 1 from public.service_order_items i where i.service_order_id = so.id)
   and (coalesce(so.labor_cost, 0) > 0 or coalesce(so.parts_cost, 0) > 0);
