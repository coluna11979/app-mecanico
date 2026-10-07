-- Permissão extra por função: quem tem mais de uma função (ex.: Vendedor + Mecânico) escolhe
-- em qual delas cada permissão vale. Ex.: {"plataforma": ["vendedor"]} → Plataforma só quando
-- entrar como Vendedor. Permissão fora do mapa (ou {}) vale em todas as funções, como antes.
alter table public.workshop_operators
  add column if not exists perm_roles jsonb not null default '{}'::jsonb;

comment on column public.workshop_operators.perm_roles is
  'Permissão → funções em que ela vale (ex.: {"plataforma":["vendedor"]}). Ausente = vale em todas.';
