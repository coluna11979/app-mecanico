-- Quanto a oficina cobrou do cliente por uma demanda da plataforma (valor geral, opcional).
-- Serve para a oficina sem OS (pacote "Só mecânicos") ver o lucro no Painel da Plataforma:
-- cobrado do cliente − pago ao mecânico.
-- Tabela separada de jobs DE PROPÓSITO: o mecânico lê a linha da demanda dele em jobs, e não pode
-- ver quanto a oficina cobrou (a margem dela). Aqui só a própria oficina (e o admin) enxerga.

create table if not exists public.job_customer_charges (
  job_id      uuid primary key references public.jobs(id) on delete cascade,
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  amount      numeric(10,2) not null check (amount >= 0),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);

create index if not exists job_customer_charges_workshop_idx on public.job_customer_charges (workshop_id);

alter table public.job_customer_charges enable row level security;

drop policy if exists job_customer_charges_member on public.job_customer_charges;
create policy job_customer_charges_member on public.job_customer_charges for all
  using (public.is_admin(auth.uid()) or public.is_workshop_member(workshop_id, auth.uid()))
  with check (
    (public.is_admin(auth.uid()) or public.is_workshop_member(workshop_id, auth.uid()))
    -- a demanda tem que ser da própria oficina
    and exists (select 1 from public.jobs j where j.id = job_id and j.workshop_id = job_customer_charges.workshop_id)
  );

grant select, insert, update, delete on public.job_customer_charges to authenticated;
