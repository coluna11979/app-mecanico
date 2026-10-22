-- Regras especiais de comissão por item (configuráveis por loja, em Fechar comissões → Regras por item).
-- Ex. Jota Car: alinhamento, balanceamento, pneu, bico de ar e cambagem não dão comissão a ninguém;
-- exceções em valor fixo para quem fez: Rafael R$ 5 por alinhamento e R$ 10 a cada 2 cambagens; Bruno R$ 10 a cada 2 cambagens.
-- O item é reconhecido pelo nome (a palavra-chave aparece na descrição, sem diferenciar acento/maiúscula).
-- Regra com mechanic_id nulo = vale para todos (só tira o item da conta). Com mechanic_id + amount = valor fixo
-- a cada per_units unidades (floor), para essa pessoa quando ela fez o item.

create table if not exists public.commission_item_rules (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references public.workshops(id) on delete cascade,
  keyword      text not null check (length(trim(keyword)) >= 3),
  mechanic_id  uuid references public.workshop_mechanics(id) on delete cascade,
  amount       numeric not null default 0 check (amount >= 0),
  per_units    integer not null default 1 check (per_units >= 1),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists commission_item_rules_ws_idx on public.commission_item_rules (workshop_id) where active;

alter table public.commission_item_rules enable row level security;
drop policy if exists commission_item_rules_read on public.commission_item_rules;
create policy commission_item_rules_read on public.commission_item_rules for select
  using (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));
drop policy if exists commission_item_rules_write on public.commission_item_rules;
create policy commission_item_rules_write on public.commission_item_rules for all
  using (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()));

-- A view ganha a coluna "fixed" no fim (create or replace aceita coluna nova no final)
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
  select s1.service_order_id, s1.id as item_id, s1.kind, s1.quantity, s1.unit_price, s1.description, s1.workshop_id as item_ws,
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
ruled0 as (
  select d.*,
         (coalesce(d.done_at, now()) >= timestamptz '2026-10-01 00:00:00-03' or d.source = 'paper_import') as v2,
         translate(lower(d.description), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') as dnorm
    from dated d
),
ruled as (
  select r.*,
         -- Item com regra especial da loja (ex.: alinhamento): não entra nos 4% / 10% de ninguém
         exists (select 1 from public.commission_item_rules cr
                  where cr.workshop_id = r.item_ws and cr.active
                    and r.dnorm like '%' || translate(lower(cr.keyword), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') || '%') as excl,
         -- Valor fixo para quem fez, se a regra tiver (ex.: Rafael R$ 5 por alinhamento; R$ 10 a cada 2 cambagens)
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
       -- 4%: serviço + peças dele (cliente trouxe a peça → o serviço vira mão de obra)
       round(coalesce(sum(r.quantity * r.unit_price) filter (
         where r.v2 and not r.excl and r.eff_type = 'servico' and not so.customer_brought_parts), 0), 2) as svc_base,
       -- 10%: mão de obra (serviço sem peça)
       round(coalesce(sum(r.quantity * r.unit_price) filter (
         where r.v2 and not r.excl and r.kind = 'labor' and (r.eff_type = 'mao_de_obra' or so.customer_brought_parts)), 0), 2) as mo_base,
       0::numeric as manual,
       round(coalesce(sum(r.fixed_amt), 0), 2) as fixed
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
-- Comissão definida à mão na OS: substitui a regra para aquela OS (vale quando a OS é concluída)
select so.id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       o.mechanic_id, 0::numeric, 0::numeric, so.customer_brought_parts, 0::numeric,
       case when so.status = 'completed' and so.quote_status is null then so.completed_at end,
       true, 0::numeric, 0::numeric, o.amount, 0::numeric
  from public.os_commission_overrides o
  join public.service_orders so on so.id = o.service_order_id
 where so.commission_manual;

-- Jota Car (informado em 02/10/2026)
insert into public.commission_item_rules (workshop_id, keyword, mechanic_id, amount, per_units)
select '69408e90-6119-4d33-b73d-b91c24ed44de', k, null, 0, 1
  from unnest(array['alinhamento', 'balanceamento', 'pneu', 'bico de ar', 'cambagem']) k
 where not exists (select 1 from public.commission_item_rules r
                    where r.workshop_id = '69408e90-6119-4d33-b73d-b91c24ed44de' and r.keyword = k and r.mechanic_id is null);
insert into public.commission_item_rules (workshop_id, keyword, mechanic_id, amount, per_units)
select '69408e90-6119-4d33-b73d-b91c24ed44de', v.k, m.id, v.amt, v.per
  from (values ('Rafael', 'alinhamento', 5::numeric, 1), ('Rafael', 'cambagem', 10::numeric, 2), ('Bruno', 'cambagem', 10::numeric, 2)) v(nome, k, amt, per)
  join public.workshop_mechanics m on m.workshop_id = '69408e90-6119-4d33-b73d-b91c24ed44de' and m.name = v.nome
 where not exists (select 1 from public.commission_item_rules r where r.mechanic_id = m.id and r.keyword = v.k);
