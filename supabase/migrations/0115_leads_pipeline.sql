-- Transforma a tabela `leads` (que hoje é só captura do formulário público)
-- em pipeline de captação completo para o admin.
-- Preserva colunas existentes (name, email, phone, intent, consent, user_agent, referrer, created_at)
-- e adiciona status/origem/responsável/próxima_ação/conversão/UTM.

-- 1. Enums
do $$ begin
  create type lead_status as enum (
    'lead_novo', 'contato_feito', 'interessado',
    'cadastro_iniciado', 'convertido', 'perdido'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_origem as enum (
    'formulario_site', 'indicacao', 'instagram', 'facebook',
    'google_ads', 'google_maps', 'whatsapp',
    'importado_csv', 'link_convite', 'evento', 'outro'
  );
exception when duplicate_object then null; end $$;

-- 2. Colunas novas (aditivas, não mexem no que existe)
alter table public.leads
  add column if not exists cidade               text,
  add column if not exists estado               text,
  add column if not exists status               lead_status not null default 'lead_novo',
  add column if not exists origem               lead_origem not null default 'formulario_site',
  add column if not exists responsavel_id       uuid references public.profiles(id) on delete set null,
  add column if not exists proxima_acao         text,
  add column if not exists data_proxima_acao    date,
  add column if not exists notas                text,
  add column if not exists tags                 text[] not null default '{}',
  add column if not exists converted_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists converted_at         timestamptz,
  add column if not exists utm_source           text,
  add column if not exists utm_medium           text,
  add column if not exists utm_campaign         text,
  add column if not exists last_contact_at      timestamptz,
  add column if not exists updated_at           timestamptz not null default now();

-- 3. Índices
create index if not exists idx_leads_status      on public.leads(status);
create index if not exists idx_leads_intent      on public.leads(intent);
create index if not exists idx_leads_origem      on public.leads(origem);
create index if not exists idx_leads_cidade      on public.leads(cidade);
create index if not exists idx_leads_responsavel on public.leads(responsavel_id);
create index if not exists idx_leads_created     on public.leads(created_at desc);
create index if not exists idx_leads_proxima     on public.leads(data_proxima_acao)
  where status not in ('convertido', 'perdido');

-- 4. Trigger de updated_at
create or replace function public.leads_touch_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_leads_touch on public.leads;
create trigger trg_leads_touch
  before update on public.leads
  for each row execute function public.leads_touch_updated();

-- 5. RLS — admin acessa tudo; mantém insert público para o formulário (anon)
alter table public.leads enable row level security;

-- Admin faz tudo
drop policy if exists "admin_all_leads" on public.leads;
create policy "admin_all_leads"
  on public.leads
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Anon pode inserir (formulário público)
drop policy if exists "anon_insert_leads" on public.leads;
create policy "anon_insert_leads"
  on public.leads
  for insert
  to anon
  with check (true);

-- 6. Comentários
comment on table public.leads is
  'Pipeline de captação. Captura do formulário público + leads manuais criados pelo admin + importação CSV.';
comment on column public.leads.intent is
  'mechanic ou workshop — vem do formulário. Mantém esse nome por compatibilidade com inserts existentes.';
comment on column public.leads.converted_profile_id is
  'Quando o lead termina o signup e vira profile, grava aqui. Nulo = ainda não convertido.';
