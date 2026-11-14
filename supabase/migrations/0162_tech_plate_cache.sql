-- Consulta técnica por placa: guarda o que o serviço de placas devolveu para não pagar
-- duas vezes pela mesma placa. Só a edge function tech-plate-lookup (service role) lê e grava.
create table if not exists public.tech_plate_cache (
  plate        text primary key check (plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  found        boolean not null default true,     -- false = serviço não achou (não insiste por 30 dias)
  make         text,
  model        text,
  version      text,
  year         int,
  model_year   int,
  fuel         text,
  engine_cc    int,
  raw          jsonb,
  workshop_id  uuid references public.workshops(id) on delete set null,   -- quem consultou primeiro
  created_at   timestamptz not null default now()
);
create index if not exists tech_plate_cache_workshop_idx on public.tech_plate_cache (workshop_id, created_at desc);

alter table public.tech_plate_cache enable row level security;
drop policy if exists tech_plate_cache_admin on public.tech_plate_cache;
create policy tech_plate_cache_admin on public.tech_plate_cache
  for select using (is_admin(auth.uid()));

-- Chave do serviço de consulta de placa (privada: só admin e edge function leem)
insert into public.app_settings (key, value, is_public, description)
values ('plate_api_token', '', false, 'Chave da API de consulta de veículo por placa (Simples API)')
on conflict (key) do nothing;
