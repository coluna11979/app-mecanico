-- Comissão quinzenal: 1ª quinzena (dias 1–15) paga no dia 15; 2ª (16–fim do mês) paga no dia 30.
-- Um registro por colaborador e quinzena. Vales NÃO entram aqui (são descontados do salário na folha).
create table if not exists public.commission_closings (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references public.workshops(id) on delete cascade,
  mechanic_id  uuid not null references public.workshop_mechanics(id) on delete cascade,
  competence   text not null check (competence ~ '^\d{4}-\d{2}$'),
  half         smallint not null check (half in (1, 2)),
  labor        numeric not null default 0,   -- mão de obra que fez
  labor_own    numeric not null default 0,   -- mão de obra com peça do cliente
  parts        numeric not null default 0,   -- peças dos itens que fez
  revenue      numeric not null default 0,   -- faturamento da loja (quem ganha % sobre ele)
  commission   numeric not null default 0 check (commission >= 0),
  rule         text,                         -- "10% serviços + 5% peças"
  payable_id   uuid references public.payables(id) on delete set null,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (mechanic_id, competence, half)
);
create index if not exists commission_closings_ws_idx on public.commission_closings (workshop_id, competence, half);

alter table public.commission_closings enable row level security;
drop policy if exists commission_closings_owner on public.commission_closings;
create policy commission_closings_owner on public.commission_closings for all
  using      (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()));
