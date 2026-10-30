-- Quanto a oficina paga ao mecânico por este serviço (opcional; 0 = não definido)
alter table public.workshop_services
  add column if not exists mechanic_pay numeric(10,2) not null default 0 check (mechanic_pay >= 0);
