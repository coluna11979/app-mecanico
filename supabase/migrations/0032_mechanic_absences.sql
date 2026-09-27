-- Afastamentos de colaboradores (férias, atestado, INSS, licença…):
-- data de afastamento, previsão de retorno e data real de retorno — base do relatório.
-- Motivo pode ser dado de saúde (LGPD): só o dono da oficina (e o admin) acessa.

create table if not exists public.workshop_mechanic_absences (
  id              uuid primary key default gen_random_uuid(),
  workshop_id     uuid not null references public.workshops(id) on delete cascade,
  mechanic_id     uuid not null references public.workshop_mechanics(id) on delete cascade,
  reason          text not null check (reason in ('vacation', 'medical', 'inss', 'leave', 'time_off', 'other')),
  started_on      date not null,
  expected_return date,
  returned_on     date,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  check (expected_return is null or expected_return >= started_on),
  check (returned_on is null or returned_on >= started_on)
);
create index if not exists mechanic_absences_mech_idx on public.workshop_mechanic_absences(mechanic_id, started_on desc);
create index if not exists mechanic_absences_ws_idx on public.workshop_mechanic_absences(workshop_id, started_on desc);
-- Um afastamento em aberto por colaborador
create unique index if not exists mechanic_absences_one_open_idx on public.workshop_mechanic_absences(mechanic_id)
  where returned_on is null;

alter table public.workshop_mechanic_absences enable row level security;

drop policy if exists mechanic_absences_owner on public.workshop_mechanic_absences;
create policy mechanic_absences_owner on public.workshop_mechanic_absences for all
  using (public.is_workshop_owner(workshop_id, auth.uid()) or public.is_admin(auth.uid()))
  with check (public.is_workshop_owner(workshop_id, auth.uid()) or public.is_admin(auth.uid()));

-- O colaborador precisa ser da mesma oficina
create or replace function public.mechanic_absence_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.workshop_mechanics where id = new.mechanic_id and workshop_id = new.workshop_id) then
    raise exception 'Colaborador não pertence a esta oficina';
  end if;
  return new;
end $$;

drop trigger if exists trg_mechanic_absence_guard on public.workshop_mechanic_absences;
create trigger trg_mechanic_absence_guard before insert or update of mechanic_id, workshop_id on public.workshop_mechanic_absences
  for each row execute function public.mechanic_absence_guard();
