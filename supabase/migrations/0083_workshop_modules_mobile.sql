-- Superadmin: módulo pode ficar liberado no computador e bloqueado no celular/tablet.
-- Mesma lógica de disabled_modules: guarda só os bloqueados, vazio = tudo liberado.
alter table public.workshop_modules
  add column if not exists mobile_disabled_modules text[] not null default '{}';
