-- Lista de mecânicos preferidos por oficina + audience em jobs
-- pra permitir publicação restrita à lista privada da oficina.

create table if not exists public.workshop_favorite_mechanics (
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  mechanic_id uuid not null references public.mechanics(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (workshop_id, mechanic_id)
);

create index if not exists wfm_workshop_idx on public.workshop_favorite_mechanics(workshop_id);
create index if not exists wfm_mechanic_idx on public.workshop_favorite_mechanics(mechanic_id);

alter table public.workshop_favorite_mechanics enable row level security;

-- Membro da oficina gerencia a lista da própria oficina
drop policy if exists wfm_workshop_all on public.workshop_favorite_mechanics;
create policy wfm_workshop_all on public.workshop_favorite_mechanics
  for all
  using (public.is_workshop_member(workshop_id, auth.uid()) or public.is_admin(auth.uid()))
  with check (public.is_workshop_member(workshop_id, auth.uid()) or public.is_admin(auth.uid()));

-- Mecânico vê registros onde ele é o favoritado (pra badge "Você é preferido")
drop policy if exists wfm_mechanic_select on public.workshop_favorite_mechanics;
create policy wfm_mechanic_select on public.workshop_favorite_mechanics
  for select
  using (
    mechanic_id in (
      select id from public.mechanics where profile_id = auth.uid()
    )
  );

-- Nova coluna audience em jobs (additiva, default 'public' não muda comportamento)
alter table public.jobs add column if not exists audience text not null default 'public';
alter table public.jobs drop constraint if exists jobs_audience_check;
alter table public.jobs add constraint jobs_audience_check
  check (audience in ('public', 'favorites'));

create index if not exists jobs_audience_favorites_idx on public.jobs(audience)
  where audience = 'favorites';

-- Atualiza policy jobs_select pra respeitar audience='favorites'
drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs
  for select
  using (
    public.is_admin(auth.uid())
    or (status = 'open'::job_status and (
      audience = 'public'
      or exists (
        select 1
        from public.workshop_favorite_mechanics f
        join public.mechanics m on m.id = f.mechanic_id
        where f.workshop_id = jobs.workshop_id
          and m.profile_id = auth.uid()
      )
    ))
    or public.is_workshop_member(workshop_id, auth.uid())
    or mechanic_id in (
      select id from public.mechanics where profile_id = auth.uid()
    )
  );
