-- Superadmin: módulos liberados por oficina.
-- Guarda só o que está DESLIGADO: oficina sem linha (ou lista vazia) tem tudo liberado,
-- e módulo novo já nasce ligado para todo mundo.
-- Tabela separada de workshops porque os membros da oficina podem editar workshops;
-- aqui só o admin escreve.

create table if not exists public.workshop_modules (
  workshop_id      uuid primary key references public.workshops(id) on delete cascade,
  disabled_modules text[] not null default '{}',
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles(id) on delete set null
);

alter table public.workshop_modules enable row level security;

drop policy if exists workshop_modules_read on public.workshop_modules;
create policy workshop_modules_read on public.workshop_modules for select
  using (
    public.is_admin(auth.uid())
    or public.is_workshop_member(workshop_id, auth.uid())
  );

drop policy if exists workshop_modules_admin_write on public.workshop_modules;
create policy workshop_modules_admin_write on public.workshop_modules for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

grant select on public.workshop_modules to authenticated;
grant insert, update, delete on public.workshop_modules to authenticated;
