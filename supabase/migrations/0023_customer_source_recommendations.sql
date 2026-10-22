-- Base pronta para o futuro módulo de reativação (CRM):
-- origem do cliente e recomendações de serviço anotadas nos orçamentos.

-- De onde veio o cliente: 'app' (cadastrado no sistema) | 'paper_import' (bloquinho antigo)
alter table public.customers add column if not exists source text not null default 'app';

-- Serviços recomendados para o futuro ("avaliar bieletas na próxima revisão")
create table if not exists public.service_recommendations (
  id               uuid primary key default uuid_generate_v4(),
  workshop_id      uuid not null references public.workshops(id) on delete cascade,
  customer_id      uuid references public.customers(id) on delete cascade,
  vehicle_id       uuid references public.vehicles(id) on delete set null,
  service_order_id uuid references public.service_orders(id) on delete set null,
  description      text not null,
  status           text not null default 'pending' check (status in ('pending', 'done', 'dismissed')),
  source           text not null default 'app',   -- 'app' | 'paper_import'
  recommended_at   timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create index if not exists service_recommendations_workshop_idx
  on public.service_recommendations (workshop_id, status, recommended_at desc);
create index if not exists service_recommendations_customer_idx
  on public.service_recommendations (customer_id);

alter table public.service_recommendations enable row level security;

drop policy if exists service_recommendations_owner on public.service_recommendations;
create policy service_recommendations_owner on public.service_recommendations
  for all
  using      (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));
