-- Fechamento da folha: um registro por colaborador e mês (competência).
-- Líquido = salário + comissão − faltas − outros descontos − vales do mês − vale que sobrou do mês anterior.
-- Se os descontos passam do que há para receber, o que sobra (carry_out) é descontado no mês seguinte.
-- Salário é dado sensível: só o dono da oficina acessa (igual a workshop_mechanic_private).
create table if not exists public.payroll_items (
  id               uuid primary key default gen_random_uuid(),
  workshop_id      uuid not null references public.workshops(id) on delete cascade,
  mechanic_id      uuid not null references public.workshop_mechanics(id) on delete cascade,
  competence       text not null check (competence ~ '^\d{4}-\d{2}$'),
  base_salary      numeric not null default 0 check (base_salary >= 0),
  commission       numeric not null default 0 check (commission >= 0),
  absence_days     numeric not null default 0 check (absence_days >= 0),
  absence_discount numeric not null default 0 check (absence_discount >= 0),
  other_discount   numeric not null default 0 check (other_discount >= 0),
  vales            numeric not null default 0 check (vales >= 0),
  carry_in         numeric not null default 0 check (carry_in >= 0),
  net              numeric not null default 0 check (net >= 0),
  carry_out        numeric not null default 0 check (carry_out >= 0),
  payable_id       uuid references public.payables(id) on delete set null,
  notes            text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  unique (mechanic_id, competence)
);
create index if not exists payroll_items_ws_idx on public.payroll_items (workshop_id, competence);

alter table public.payroll_items enable row level security;
drop policy if exists payroll_items_owner on public.payroll_items;
create policy payroll_items_owner on public.payroll_items for all
  using      (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()));
