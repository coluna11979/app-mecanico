-- Comissão do mecânico da equipe: % sobre a mão de obra (serviços) das OS que ele concluiu.
alter table public.workshop_mechanics
  add column if not exists commission_percent numeric not null default 0
  check (commission_percent >= 0 and commission_percent <= 100);
