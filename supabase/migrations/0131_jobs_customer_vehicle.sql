-- Demanda ligada ao cliente e ao carro (Meus clientes do módulo Plataforma).
-- A oficina "Só mecânicos" cadastra clientes e carros nas mesmas tabelas do módulo Clientes
-- (customers / vehicles); "Chamar mecânico para este carro" grava aqui de quem é a demanda,
-- e a ficha do cliente lista as demandas feitas para ele. Se a oficina ligar Clientes/OS depois,
-- é o mesmo cadastro: nada a migrar.

alter table public.jobs
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists vehicle_id  uuid references public.vehicles(id)  on delete set null;

create index if not exists jobs_customer_idx on public.jobs (customer_id) where customer_id is not null;
