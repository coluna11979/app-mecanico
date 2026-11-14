-- Fila "Falta cadastrar" do catálogo técnico: ignorar itens e juntar variações de escrita.
-- A fila sai dos carros cadastrados nas oficinas e das buscas sem ficha; apagar de lá apagaria
-- dado de cliente. "Ignorar" só esconde o modelo da fila (tabela abaixo), sem tocar em vehicles.

create table if not exists public.tech_queue_ignored (
  key        text primary key,          -- modelo normalizado (tech_norm)
  label      text not null,             -- como apareceu na fila
  reason     text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.tech_queue_ignored enable row level security;
drop policy if exists tech_queue_ignored_admin on public.tech_queue_ignored;
create policy tech_queue_ignored_admin on public.tech_queue_ignored
  for all using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- "Ônix", "ONIX", "T. Cross", "Tcross", "Cross Fox" → mesma chave
create or replace function public.tech_norm(t text) returns text
language sql immutable as $$
  select regexp_replace(translate(lower(coalesce(t, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]', '', 'g')
$$;

create or replace function public.tech_missing_models()
returns table (make text, model text, cars bigint, lookups bigint)
language sql stable security definer set search_path = public as $$
  with cars as (
    select tech_norm(v.model) as k,
           max(nullif(upper(trim(v.make)), 'NÃO INFORMADO')) as make,
           min(trim(v.model)) as model, count(*) as n
    from vehicles v
    where length(trim(coalesce(v.model, ''))) > 0
    group by 1
  ), looks as (
    select tech_norm(l.query) as k, min(trim(l.query)) as model, count(*) as n
    from tech_lookup_log l
    where l.vehicle_id is null
    group by 1
  ), merged as (
    select coalesce(c.k, l.k) as k, c.make, coalesce(c.model, l.model) as model,
           coalesce(c.n, 0) as cars, coalesce(l.n, 0) as lookups
    from cars c full join looks l on l.k = c.k
  )
  select m.make, m.model, m.cars, m.lookups
  from merged m
  where is_admin(auth.uid())
    and m.k <> ''
    and not exists (select 1 from tech_vehicles t where tech_norm(t.model) = m.k)
    and not exists (select 1 from tech_queue_ignored i where i.key = m.k)
  order by m.lookups desc, m.cars desc
  limit 300;
$$;

revoke all on function public.tech_missing_models() from public, anon;
grant execute on function public.tech_missing_models() to authenticated;
