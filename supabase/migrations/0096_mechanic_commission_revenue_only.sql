-- "Só % do faturamento": quem é gerente e ganha apenas a % sobre tudo que a loja fatura (ex.: 1,5%),
-- sem a regra de 4% / 10% sobre o que faz na OS. Diferente de no_commission (salário fixo), que zera tudo.
alter table public.workshop_mechanics add column if not exists commission_revenue_only boolean not null default false;

comment on column public.workshop_mechanics.commission_revenue_only is
  'Só recebe a % do faturamento da loja (commission_revenue_percent): a regra 4%/10% e valores digitados na OS não valem para ele';
