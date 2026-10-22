-- Importação de orçamentos em papel (foto → IA → conferência → cliente/veículo/OS histórica)

-- ── 1. Configurações da IA (editáveis no painel admin; nada fixo no código) ──
insert into public.app_settings (key, value, description, is_public) values
  ('anthropic_api_key', '',              'Chave da API Anthropic usada na leitura de fotos de orçamentos', false),
  ('ai_vision_model',   'claude-opus-5', 'Modelo usado na leitura de fotos de orçamentos',                 false),
  ('ai_vision_effort',  'medium',        'Esforço da IA na leitura (low | medium | high)',                 false),
  ('ai_refusal_fallback', 'default',     'Fallback da IA em recusa ("default" ou vazio para desligar)',    false)
on conflict (key) do nothing;

-- ── 2. Bucket privado para fotos/anexos de OS (pasta = id da oficina) ─────────
insert into storage.buckets (id, name, public)
values ('os-attachments', 'os-attachments', false)
on conflict (id) do nothing;

drop policy if exists os_attachments_member_select on storage.objects;
create policy os_attachments_member_select on storage.objects for select
  using (bucket_id = 'os-attachments'
         and (public.is_workshop_member(((storage.foldername(name))[1])::uuid, auth.uid()) or public.is_admin(auth.uid())));

drop policy if exists os_attachments_member_insert on storage.objects;
create policy os_attachments_member_insert on storage.objects for insert
  with check (bucket_id = 'os-attachments'
              and public.is_workshop_member(((storage.foldername(name))[1])::uuid, auth.uid()));

drop policy if exists os_attachments_member_delete on storage.objects;
create policy os_attachments_member_delete on storage.objects for delete
  using (bucket_id = 'os-attachments'
         and public.is_workshop_member(((storage.foldername(name))[1])::uuid, auth.uid()));

-- ── 3. Fila de importações ───────────────────────────────────────────────────
create table if not exists public.paper_imports (
  id               uuid primary key default uuid_generate_v4(),
  workshop_id      uuid not null references public.workshops(id) on delete cascade,
  image_path       text not null,
  status           text not null default 'pending'
                   check (status in ('pending', 'processing', 'extracted', 'confirmed', 'failed', 'discarded')),
  extracted        jsonb,
  error            text,
  service_order_id uuid references public.service_orders(id) on delete set null,
  customer_id      uuid references public.customers(id) on delete set null,
  model            text,
  input_tokens     integer,
  output_tokens    integer,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  processed_at     timestamptz,
  confirmed_at     timestamptz
);

create index if not exists paper_imports_workshop_idx on public.paper_imports (workshop_id, created_at desc);
create index if not exists paper_imports_os_idx on public.paper_imports (service_order_id);

alter table public.paper_imports enable row level security;

drop policy if exists paper_imports_owner on public.paper_imports;
create policy paper_imports_owner on public.paper_imports
  for all
  using      (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

-- ── 4. Origem da OS e contato com clientes ──────────────────────────────────
alter table public.service_orders add column if not exists source text not null default 'app';  -- app | paper_import

alter table public.customers add column if not exists contact_opt_out   boolean not null default false; -- LGPD: não quer contato
alter table public.customers add column if not exists last_contacted_at timestamptz;
