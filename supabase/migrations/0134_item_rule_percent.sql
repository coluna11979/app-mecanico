-- Regra por item em PORCENTAGEM: o colaborador ganha X% do valor do item quando foi ele que fez.
-- Antes só havia valor fixo (R$ por unidade / a cada N unidades). Ex.: Jota Car — Rafael e Bruno passam a ganhar
-- 10% do valor de alinhamento e de cambagem (os demais continuam sem comissão nesses itens).
-- Na view os_commission_base a coluna "fixed" passa a ser o maior entre o valor fixo e a % do item.
alter table public.commission_item_rules
  add column if not exists percent numeric not null default 0 check (percent >= 0 and percent <= 100);

comment on column public.commission_item_rules.percent is
  '% do valor do item (quantidade × preço) para o colaborador da regra quando ele fez o item; 0 = não usa % (vale o valor fixo, se houver)';

-- Troca só a conta do "fixed" na view atual, sem reescrevê-la inteira (por isso lê a definição vigente)
do $$
declare d text; n text;
begin
  d := pg_get_viewdef('public.os_commission_base'::regclass, true);
  n := replace(d, 'max(floor(r.quantity / GREATEST(cr.per_units, 1)::numeric) * cr.amount)',
    'max(GREATEST(CASE WHEN cr.amount > 0::numeric THEN floor(r.quantity / GREATEST(cr.per_units, 1)::numeric) * cr.amount ELSE 0::numeric END, r.quantity * r.unit_price * cr.percent / 100::numeric))');
  n := replace(n, 'cr.active AND cr.amount > 0::numeric AND cr.mechanic_id',
    'cr.active AND (cr.amount > 0::numeric OR cr.percent > 0::numeric) AND cr.mechanic_id');
  if n = d or position('cr.percent > 0' in n) = 0 or position('* cr.percent' in n) = 0 then
    raise exception 'view os_commission_base mudou: ajustar esta migration';
  end if;
  execute 'create or replace view public.os_commission_base with (security_invoker = true) as ' || n;
end $$;
