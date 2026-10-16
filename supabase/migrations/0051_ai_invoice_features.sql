-- Recursos liberados por oficina (ex.: 'ai_invoice' = ler PDF de nota de compra com IA)
-- e registro de uso da IA (tokens) para acompanhar custo por oficina.
-- O XML da NF-e é lido no navegador, sem IA, e não depende de liberação.

create table if not exists public.workshop_features (
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  feature     text not null,
  enabled_at  timestamptz not null default now(),
  enabled_by  uuid references public.profiles(id) on delete set null,
  primary key (workshop_id, feature)
);

alter table public.workshop_features enable row level security;
drop policy if exists workshop_features_read on public.workshop_features;
create policy workshop_features_read on public.workshop_features for select
  using (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));
drop policy if exists workshop_features_admin on public.workshop_features;
create policy workshop_features_admin on public.workshop_features for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create table if not exists public.ai_usage_log (
  id            uuid primary key default uuid_generate_v4(),
  workshop_id   uuid references public.workshops(id) on delete set null,
  feature       text not null,
  model         text,
  input_tokens  integer,
  output_tokens integer,
  ok            boolean not null default true,
  error         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists ai_usage_log_ws_idx on public.ai_usage_log (workshop_id, created_at desc);

alter table public.ai_usage_log enable row level security;
drop policy if exists ai_usage_log_read on public.ai_usage_log;
create policy ai_usage_log_read on public.ai_usage_log for select
  using (is_admin(auth.uid()) or (workshop_id is not null and is_workshop_owner(workshop_id, auth.uid())));
-- escrita só pela Edge Function (service role)
