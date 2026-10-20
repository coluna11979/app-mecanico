-- Central de Crescimento: Metas (admin_goals) + Radar de Conexões (RPCs).
-- RPCs aplicadas em produção em 0130 + patch 0131c (cast para user_role).
-- Este arquivo consolida a versão final para referência.

-- =============================================================
-- METAS
-- =============================================================
do $$ begin
  create type admin_goal_type as enum (
    'cadastros_mecanico','cadastros_oficina','leads_convertidos','jobs_concluidos','receita_mes'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.admin_goals (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  tipo          admin_goal_type not null,
  target_value  numeric not null check (target_value > 0),
  period_start  date not null,
  period_end    date not null check (period_end >= period_start),
  notas         text,
  arquivada     boolean not null default false,
  criado_por    uuid references public.profiles(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_admin_goals_period on public.admin_goals(period_end desc) where arquivada = false;

alter table public.admin_goals enable row level security;
drop policy if exists admin_all_goals on public.admin_goals;
create policy admin_all_goals on public.admin_goals for all to authenticated
  using  (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'::public.user_role))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'::public.user_role));

create or replace function public.admin_goal_current_value(
  p_tipo admin_goal_type, p_start date, p_end date
) returns numeric
language plpgsql security definer set search_path = public as $$
declare v numeric := 0;
begin
  case p_tipo
    when 'cadastros_mecanico' then
      select count(*) into v from public.profiles
       where role = 'mechanic'::public.user_role and created_at::date between p_start and p_end;
    when 'cadastros_oficina' then
      select count(*) into v from public.profiles
       where role = 'workshop'::public.user_role and created_at::date between p_start and p_end;
    when 'leads_convertidos' then
      select count(*) into v from public.leads
       where converted_at is not null and converted_at::date between p_start and p_end;
    when 'jobs_concluidos' then
      select count(*) into v from public.jobs
       where status = 'completed' and completed_at::date between p_start and p_end;
    when 'receita_mes' then
      select coalesce(sum(price), 0) into v from public.jobs
       where status = 'completed' and completed_at::date between p_start and p_end;
  end case;
  return v;
end;
$$;
revoke all on function public.admin_goal_current_value(admin_goal_type, date, date) from public;
grant execute on function public.admin_goal_current_value(admin_goal_type, date, date) to authenticated;

create or replace function public.admin_goals_with_progress()
returns table (
  id uuid, nome text, tipo admin_goal_type,
  target_value numeric, current_value numeric,
  period_start date, period_end date,
  notas text, arquivada boolean, criado_em timestamptz
)
language sql security definer set search_path = public as $$
  select g.id, g.nome, g.tipo,
         g.target_value,
         public.admin_goal_current_value(g.tipo, g.period_start, g.period_end) as current_value,
         g.period_start, g.period_end,
         g.notas, g.arquivada, g.criado_em
    from public.admin_goals g
   where exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'::public.user_role)
   order by g.arquivada asc, g.period_end asc;
$$;
revoke all on function public.admin_goals_with_progress() from public;
grant execute on function public.admin_goals_with_progress() to authenticated;

-- =============================================================
-- RADAR
-- =============================================================
create or replace function public.norm_cidade(txt text)
returns text language sql immutable as $$
  select nullif(btrim(upper(public.unaccent(coalesce(txt, '')))), '');
$$;

create or replace function public.admin_radar_cidades()
returns table (
  cidade_key   text, cidade text, estado text,
  n_mecanicos  int,  n_oficinas int,
  mec_aprovados int, ofi_aprovadas int,
  razao_mec_ofi numeric, status text, oportunidade int
)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'::public.user_role) then
    raise exception 'Acesso restrito a admin';
  end if;
  return query
  with m as (
    select public.norm_cidade(m.city) as k,
           min(m.city) as display, min(upper(coalesce(m.state, ''))) as uf,
           count(*)::int as total,
           count(*) filter (where p.status = 'approved')::int as aprov
      from public.mechanics m
      join public.profiles p on p.id = m.profile_id
     where public.norm_cidade(m.city) is not null
     group by public.norm_cidade(m.city)
  ),
  w as (
    select public.norm_cidade(w.city) as k,
           min(w.city) as display, min(upper(coalesce(w.state, ''))) as uf,
           count(*)::int as total,
           count(*) filter (where p.status = 'approved')::int as aprov
      from public.workshops w
      join public.profiles p on p.id = w.profile_id
     where public.norm_cidade(w.city) is not null
     group by public.norm_cidade(w.city)
  ),
  u as (
    select coalesce(m.k, w.k) as k,
           coalesce(m.display, w.display) as cidade,
           coalesce(m.uf, w.uf) as uf,
           coalesce(m.total, 0) as nm,
           coalesce(w.total, 0) as nw,
           coalesce(m.aprov, 0) as am,
           coalesce(w.aprov, 0) as aw
      from m full outer join w on w.k = m.k
  )
  select u.k,
         initcap(lower(u.cidade)) as cidade,
         u.uf as estado,
         u.nm, u.nw, u.am, u.aw,
         case when u.nw = 0 then null::numeric
              else round(u.nm::numeric / u.nw::numeric, 2) end,
         case when u.nw = 0 and u.nm > 0 then 'sem_oficina'
              when u.nm = 0 and u.nw > 0 then 'sem_mecanico'
              when u.nm::numeric / nullif(u.nw, 0) > 3   then 'excesso_mecanico'
              when u.nm::numeric / nullif(u.nw, 0) < 0.4 then 'excesso_oficina'
              else 'equilibrado' end,
         (case when u.nw = 0 and u.nm > 0 then 90
               when u.nm = 0 and u.nw > 0 then 95
               when u.nm::numeric / nullif(u.nw, 0) > 3 then 70
               when u.nm::numeric / nullif(u.nw, 0) < 0.4 then 75
               else 20 end
          + least(u.nm + u.nw, 10))::int
    from u
   order by oportunidade desc, (u.nm + u.nw) desc;
end;
$$;
revoke all on function public.admin_radar_cidades() from public;
grant execute on function public.admin_radar_cidades() to authenticated;

create or replace function public.admin_radar_resumo()
returns table (
  total_mec int, total_ofi int,
  mec_sem_cidade int, ofi_sem_cidade int,
  cidades_cobertas int,
  cidades_sem_mecanico int, cidades_sem_oficina int,
  razao_global numeric
)
language sql security definer set search_path = public as $$
  with
  mec as (select count(*)::int c, count(*) filter (where city is null or btrim(city) = '')::int sc from public.mechanics),
  ofi as (select count(*)::int c, count(*) filter (where city is null or btrim(city) = '')::int sc from public.workshops),
  cid as (
    select count(*)::int total,
           count(*) filter (where n_mecanicos = 0)::int sem_mec,
           count(*) filter (where n_oficinas = 0)::int sem_ofi
      from public.admin_radar_cidades()
  )
  select mec.c, ofi.c, mec.sc, ofi.sc,
         cid.total, cid.sem_mec, cid.sem_ofi,
         case when ofi.c = 0 then null::numeric
              else round(mec.c::numeric / ofi.c::numeric, 2)
         end
    from mec, ofi, cid
   where exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'::public.user_role);
$$;
revoke all on function public.admin_radar_resumo() from public;
grant execute on function public.admin_radar_resumo() to authenticated;

comment on table public.admin_goals is 'Metas da Central de Crescimento (captação, conversão, receita). Admin-only.';
comment on function public.admin_radar_cidades() is 'Radar: cruza mecânicos x oficinas por cidade normalizada e classifica desequilíbrio.';
