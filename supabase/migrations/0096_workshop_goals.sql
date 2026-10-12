-- Metas mensais: da loja (mechanic_id nulo) e de cada colaborador.
-- Meta da loja = faturamento do mês; meta do colaborador = valor das OS concluídas em que ele é o responsável.
-- Uma linha por escopo e mês (competência AAAA-MM). Mês sem meta própria repete a do último mês definido (no app).
create table if not exists public.workshop_goals (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  mechanic_id uuid references public.workshop_mechanics(id) on delete cascade,
  competence  text not null check (competence ~ '^\d{4}-\d{2}$'),
  target      numeric not null check (target >= 0),
  scope       text generated always as (coalesce(mechanic_id::text, 'shop')) stored,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (workshop_id, competence, scope)
);
create index if not exists workshop_goals_ws_idx on public.workshop_goals (workshop_id, competence);

alter table public.workshop_goals enable row level security;
drop policy if exists workshop_goals_owner on public.workshop_goals;
create policy workshop_goals_owner on public.workshop_goals for all
  using      (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()));
