-- Colaborador com salário fixo, sem comissão: a regra da loja (4% / 10%) não vale para ele.
-- O cálculo (painel, quinzena, folha) zera a comissão de quem tem no_commission; as bases continuam
-- aparecendo para análise (o que ele fez, quanto faturou).

alter table public.workshop_mechanics add column if not exists no_commission boolean not null default false;

comment on column public.workshop_mechanics.no_commission is
  'Salário fixo: não recebe comissão (nem a regra 4%/10%, nem % da ficha, nem valor definido na OS)';

-- Jota Car: Daniel tem salário fixo (informado em 02/10/2026)
update public.workshop_mechanics set no_commission = true
 where workshop_id = '69408e90-6119-4d33-b73d-b91c24ed44de' and name = 'Daniel';

-- E sai do registro de setembro "já pago" (não houve comissão para ele)
delete from public.commission_closings c
 using public.workshop_mechanics m
 where m.id = c.mechanic_id and m.workshop_id = '69408e90-6119-4d33-b73d-b91c24ed44de' and m.name = 'Daniel'
   and c.competence = '2026-09' and c.payable_id is null;
