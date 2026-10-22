-- Quem executou o serviço da OS: mecânico da loja (workshop_mechanic_id) ou mecânico da plataforma (demanda/job).
-- O caixa passa a ser obrigado a informar isso ao receber a OS.

alter table public.service_orders
  add column if not exists executor text check (executor in ('workshop', 'platform'));

comment on column public.service_orders.executor is
  'Quem executou: workshop = mecânico da equipe (workshop_mechanic_id); platform = mecânico autônomo chamado pela plataforma (jobs.service_order_id)';

-- OS antigas com responsável da equipe já contam como "loja"
update public.service_orders set executor = 'workshop'
  where executor is null and workshop_mechanic_id is not null;

-- Demanda publicada a partir de uma OS ("Chamar mecânico" no Caixa)
alter table public.jobs
  add column if not exists service_order_id uuid references public.service_orders(id) on delete set null;

create index if not exists jobs_service_order_id_idx on public.jobs(service_order_id) where service_order_id is not null;
