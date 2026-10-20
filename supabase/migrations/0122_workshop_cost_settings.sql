-- Parâmetros do custo real da equipe (uma linha por oficina): regime tributário (define os encargos),
-- benefícios mensais por mecânico (VT, refeição, uniforme, EPI) e o valor/hora do mecânico da plataforma
-- usado no simulador de comparação. Só o dono da oficina lê e altera.
create table if not exists public.workshop_cost_settings (
  workshop_id     uuid primary key references public.workshops(id) on delete cascade,
  regime          text not null default 'simples' check (regime in ('simples', 'presumido')),
  benefits_monthly numeric not null default 0 check (benefits_monthly >= 0),
  platform_hourly numeric not null default 80 check (platform_hourly >= 0),
  updated_at      timestamptz not null default now()
);

alter table public.workshop_cost_settings enable row level security;
drop policy if exists workshop_cost_settings_owner on public.workshop_cost_settings;
create policy workshop_cost_settings_owner on public.workshop_cost_settings for all
  using      (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()));
