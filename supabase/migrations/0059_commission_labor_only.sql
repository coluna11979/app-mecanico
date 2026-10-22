-- Comissão "só serviço" por serviço (não mais só pela OS inteira):
-- serviço sem peça da loja ligada a ele ("Usada em") paga a % de "só serviço"
-- (workshop_mechanics.commission_own_parts_percent — ex.: 10%); serviço com peça da loja paga a % de serviços
-- + a % de peças sobre as peças dele (ex.: 0% + 4%).
-- Vale para OS concluídas a partir de 01/10/2026 (quinzenas anteriores ficam como foram calculadas).
-- "Cliente trouxe a peça" na OS continua valendo para a OS inteira.

comment on column public.workshop_mechanics.commission_own_parts_percent is
  '% sobre a mão de obra "só serviço": serviço sem peça da loja (ou OS com peça do cliente); null = usa commission_percent';

-- Mesma view da 0058 + labor_only (mão de obra dos serviços sem peça da loja) no fim
create or replace view public.os_commission_base with (security_invoker = true) as
with it as (
  select i.service_order_id, i.kind, i.quantity, i.unit_price,
         case
           when i.kind = 'part' and li.id is not null then
             case when li.executor = 'platform' then null
                  else coalesce(li.workshop_mechanic_id, so.workshop_mechanic_id) end
           when i.executor = 'platform' then null
           else coalesce(i.workshop_mechanic_id, so.workshop_mechanic_id)
         end as mechanic_id,
         (i.kind = 'labor'
           and coalesce(so.completed_at, now()) >= timestamptz '2026-10-01 00:00:00-03'
           and not exists (select 1 from public.service_order_items p
                            where p.used_in_item_id = i.id and p.kind = 'part')) as labor_only
    from public.service_order_items i
    join public.service_orders so on so.id = i.service_order_id
    left join public.service_order_items li on li.id = i.used_in_item_id and li.service_order_id = i.service_order_id
)
select so.id as service_order_id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       it.mechanic_id,
       round(coalesce(sum(it.quantity * it.unit_price) filter (where it.kind = 'labor'), 0), 2) as labor,
       round(coalesce(sum(it.quantity * it.unit_price) filter (where it.kind = 'part'),  0), 2) as parts,
       so.customer_brought_parts,
       round(coalesce(sum(it.quantity * it.unit_price) filter (where it.labor_only), 0), 2) as labor_only
  from public.service_orders so
  join it on it.service_order_id = so.id
 group by so.id, it.mechanic_id
union all
select so.id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       so.workshop_mechanic_id, coalesce(so.labor_cost, 0), coalesce(so.parts_cost, 0),
       so.customer_brought_parts, 0::numeric
  from public.service_orders so
 where not exists (select 1 from public.service_order_items i where i.service_order_id = so.id)
   and (coalesce(so.labor_cost, 0) > 0 or coalesce(so.parts_cost, 0) > 0);
