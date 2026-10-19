-- Serviços empilhados avulsos: a oficina (inclusive a "Só mecânicos", que não abre OS) guarda
-- serviços para juntar vários numa demanda só, para um mecânico — fica mais barato do que
-- chamar um mecânico por serviço. Os empilhados que vêm de OS continuam em service_order_items
-- (stacked_at); este é o equivalente sem OS. Os dois aparecem juntos em Demandas › Empilhados.

create table if not exists public.stacked_services (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  description text not null default '',
  /** Quanto a oficina pagaria por este serviço (valor fechado) */
  total       numeric(10,2) not null check (total >= 0),
  /** Tempo previsto em horas (opcional) */
  hours       numeric(5,2) check (hours is null or hours > 0),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null,
  /** Virou esta demanda (sai da pilha) */
  job_id      uuid references public.jobs(id) on delete set null,
  /** Tirado da pilha sem virar demanda */
  removed_at  timestamptz
);

create index if not exists stacked_services_open_idx
  on public.stacked_services (workshop_id, created_at)
  where job_id is null and removed_at is null;

alter table public.stacked_services enable row level security;

drop policy if exists stacked_services_member on public.stacked_services;
create policy stacked_services_member on public.stacked_services for all
  using (public.is_admin(auth.uid()) or public.is_workshop_member(workshop_id, auth.uid()))
  with check (public.is_admin(auth.uid()) or public.is_workshop_member(workshop_id, auth.uid()));

grant select, insert, update, delete on public.stacked_services to authenticated;
