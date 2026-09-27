-- Pausas do serviço (ex.: aguardando peça). O tempo pausado não conta como
-- tempo trabalhado pelo mecânico. Uma OS pode ter várias pausas; no máximo uma aberta.

create table if not exists public.service_order_pauses (
  id               uuid primary key default uuid_generate_v4(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  workshop_id      uuid not null,
  reason           text not null default 'Outro',
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists service_order_pauses_os_idx on public.service_order_pauses (service_order_id, started_at);

-- No máximo uma pausa em aberto por OS
create unique index if not exists service_order_pauses_one_open
  on public.service_order_pauses (service_order_id) where ended_at is null;

alter table public.service_order_pauses enable row level security;

drop policy if exists service_order_pauses_owner on public.service_order_pauses;
create policy service_order_pauses_owner on public.service_order_pauses
  for all
  using      (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

-- A pausa herda a oficina da OS (mesma regra dos itens)
drop trigger if exists trg_service_order_pauses_workshop on public.service_order_pauses;
create trigger trg_service_order_pauses_workshop
  before insert or update of service_order_id on public.service_order_pauses
  for each row execute function public.set_os_item_workshop();
