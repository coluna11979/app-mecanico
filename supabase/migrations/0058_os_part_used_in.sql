-- Peça ligada ao serviço em que foi usada: a comissão da peça segue quem fez aquele serviço
-- (equipe → o colaborador do serviço; plataforma → ninguém da equipe).
alter table public.service_order_items
  add column if not exists used_in_item_id uuid references public.service_order_items(id) on delete set null;

comment on column public.service_order_items.used_in_item_id is
  'Só peças: serviço (item labor da mesma OS) em que a peça foi usada; a comissão da peça segue quem fez esse serviço';

create index if not exists service_order_items_used_in_idx on public.service_order_items(used_in_item_id) where used_in_item_id is not null;

-- Mesma view da 0057 + peça ligada a serviço herda quem fez o serviço
create or replace view public.os_commission_base with (security_invoker = true) as
with it as (
  select i.service_order_id, i.kind, i.quantity, i.unit_price,
         case
           when i.kind = 'part' and li.id is not null then
             case when li.executor = 'platform' then null
                  else coalesce(li.workshop_mechanic_id, so.workshop_mechanic_id) end
           when i.executor = 'platform' then null
           else coalesce(i.workshop_mechanic_id, so.workshop_mechanic_id)
         end as mechanic_id
    from public.service_order_items i
    join public.service_orders so on so.id = i.service_order_id
    left join public.service_order_items li on li.id = i.used_in_item_id and li.service_order_id = i.service_order_id
)
select so.id as service_order_id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       it.mechanic_id,
       round(coalesce(sum(it.quantity * it.unit_price) filter (where it.kind = 'labor'), 0), 2) as labor,
       round(coalesce(sum(it.quantity * it.unit_price) filter (where it.kind = 'part'),  0), 2) as parts,
       so.customer_brought_parts
  from public.service_orders so
  join it on it.service_order_id = so.id
 group by so.id, it.mechanic_id
union all
select so.id, so.workshop_id, so.status, so.quote_status, so.completed_at,
       so.workshop_mechanic_id, coalesce(so.labor_cost, 0), coalesce(so.parts_cost, 0),
       so.customer_brought_parts
  from public.service_orders so
 where not exists (select 1 from public.service_order_items i where i.service_order_id = so.id)
   and (coalesce(so.labor_cost, 0) > 0 or coalesce(so.parts_cost, 0) > 0);
