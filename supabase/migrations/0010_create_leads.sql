-- Captura de leads na home — antes do visitante acessar as páginas
-- segmentadas (/mecanico ou /oficina). Permite acompanhar funil mesmo
-- de visitantes que não terminam o cadastro completo.

create table if not exists public.leads (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  email       text not null,
  phone       text not null,
  intent      text not null check (intent in ('mechanic', 'workshop')),
  consent     boolean not null default true,
  user_agent  text,
  referrer    text,
  created_at  timestamptz not null default now()
);

create index if not exists leads_intent_idx     on public.leads(intent);
create index if not exists leads_created_at_idx on public.leads(created_at desc);

alter table public.leads enable row level security;

-- Anon pode inserir (form público).
drop policy if exists leads_insert_anon on public.leads;
create policy leads_insert_anon on public.leads
  for insert with check (true);

-- Só admin lê (não expor dados de leads pra ninguém).
drop policy if exists leads_select_admin on public.leads;
create policy leads_select_admin on public.leads
  for select using (public.is_admin(auth.uid()));
