-- Relógio por responsável dentro da OS (ex.: Carlos faz a revisão, o mecânico da plataforma a troca de óleo).
-- Cada linha é um trecho de trabalho: Iniciar/Retomar abre, Pausar/Terminar fecha.
-- Tempo trabalhado do responsável = soma dos trechos. O relógio geral da OS (started_at/pausas) continua igual.

create table if not exists public.service_order_work_logs (
  id                   uuid primary key default uuid_generate_v4(),
  service_order_id     uuid not null references public.service_orders(id) on delete cascade,
  workshop_id          uuid not null,
  executor             text not null default 'workshop' check (executor in ('workshop', 'platform')),
  workshop_mechanic_id uuid references public.workshop_mechanics(id) on delete set null,
  started_at           timestamptz not null default now(),
  ended_at             timestamptz,
  pause_reason         text,                          -- trecho fechado por pausa (ex.: aguardando peça)
  finished             boolean not null default false, -- trecho fechado com "Terminei"
  created_at           timestamptz not null default now(),
  check (executor = 'platform' or workshop_mechanic_id is not null),
  check (ended_at is null or ended_at >= started_at)
);

create index if not exists service_order_work_logs_os_idx on public.service_order_work_logs (service_order_id, started_at);
create index if not exists service_order_work_logs_mech_idx on public.service_order_work_logs (workshop_mechanic_id, started_at) where workshop_mechanic_id is not null;

-- No máximo um trecho aberto por responsável na OS
create unique index if not exists service_order_work_logs_one_open
  on public.service_order_work_logs (service_order_id, coalesce(workshop_mechanic_id::text, executor)) where ended_at is null;

alter table public.service_order_work_logs enable row level security;

drop policy if exists service_order_work_logs_owner on public.service_order_work_logs;
create policy service_order_work_logs_owner on public.service_order_work_logs
  for all
  using      (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

-- Herda a oficina da OS (mesma regra dos itens e das pausas)
drop trigger if exists trg_service_order_work_logs_workshop on public.service_order_work_logs;
create trigger trg_service_order_work_logs_workshop
  before insert or update of service_order_id on public.service_order_work_logs
  for each row execute function public.set_os_item_workshop();
