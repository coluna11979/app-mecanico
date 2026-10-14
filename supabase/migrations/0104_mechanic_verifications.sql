-- Resultado das consultas da Infosimples na análise de cadastro do mecânico.
-- Uma linha por consulta (cpf, antecedentes_pf, mandados_cnj) a cada clique em "Verificar".
-- Só admin lê; quem grava é a edge function verify-mechanic (service role).

create table if not exists public.mechanic_verifications (
  id          uuid primary key default gen_random_uuid(),
  mechanic_id uuid not null references public.mechanics(id) on delete cascade,
  check_type  text not null check (check_type in ('cpf', 'antecedentes_pf', 'mandados_cnj')),
  status      text not null check (status in ('ok', 'attention', 'error')),
  summary     text not null,
  details     jsonb,
  api_code    int,
  price       numeric(10, 2),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create index if not exists mechanic_verifications_mechanic_idx
  on public.mechanic_verifications (mechanic_id, created_at desc);

alter table public.mechanic_verifications enable row level security;

drop policy if exists mechanic_verifications_admin_read on public.mechanic_verifications;
create policy mechanic_verifications_admin_read on public.mechanic_verifications
  for select using (public.is_admin(auth.uid()));
