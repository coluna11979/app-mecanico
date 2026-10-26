-- Biblioteca de ilustrações da marca (feitas no ChatGPT no mesmo estilo).
-- Usadas como capa de artigos e em banners/cards; a IA do blog escolhe pelo tema.
create table if not exists public.brand_illustrations (
  id         uuid primary key default gen_random_uuid(),
  url        text not null,
  title      text not null,
  slug       text,                                   -- cena do guia (ex: oficina-movimentada)
  audience   text not null default 'all' check (audience in ('workshop', 'mechanic', 'all')),
  tags       text[] not null default '{}',
  active     boolean not null default true,
  uses       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_brand_illustrations_tags on public.brand_illustrations using gin (tags);

alter table public.brand_illustrations enable row level security;
drop policy if exists admin_all on public.brand_illustrations;
create policy admin_all on public.brand_illustrations for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
