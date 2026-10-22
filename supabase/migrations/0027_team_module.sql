-- Módulo Equipe: cadastro completo do colaborador.
-- Dados operacionais ficam em workshop_mechanics (visíveis à oficina).
-- Dados sensíveis (LGPD) ficam em workshop_mechanic_private e documentos: SÓ o dono vê.

-- ── Quem é dono da oficina ───────────────────────────────────────────────────
create or replace function public.is_workshop_owner(_workshop_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from workshop_members where workshop_id = _workshop_id and profile_id = _user_id and role = 'owner')
      or exists (select 1 from workshops where id = _workshop_id and profile_id = _user_id);
$$;

-- ── Dados operacionais (função, vínculo, situação, qualificações) ────────────
alter table public.workshop_mechanics
  add column if not exists photo_url       text,
  add column if not exists phone           text,
  add column if not exists role_title      text,                     -- mecânico, eletricista, auxiliar…
  add column if not exists employment_type text,                     -- clt | pj | autonomo | comissionado
  add column if not exists hired_at        date,
  add column if not exists work_schedule   text,                     -- ex.: seg–sex 8h–18h
  add column if not exists status          text not null default 'active', -- active | away | terminated
  add column if not exists terminated_at   date,
  add column if not exists cnh_category    text,
  add column if not exists cnh_expires_at  date,
  add column if not exists notes           text;

alter table public.workshop_mechanics drop constraint if exists workshop_mechanics_status_check;
alter table public.workshop_mechanics add constraint workshop_mechanics_status_check
  check (status in ('active', 'away', 'terminated'));

-- Desligado some das listas de escolha (mantém o histórico)
update public.workshop_mechanics set status = 'terminated' where active = false and status = 'active';

-- ── Dados sensíveis: só o dono ──────────────────────────────────────────────
create table if not exists public.workshop_mechanic_private (
  mechanic_id       uuid primary key references public.workshop_mechanics(id) on delete cascade,
  workshop_id       uuid not null references public.workshops(id) on delete cascade,
  cpf               text,
  rg                text,
  birth_date        date,
  email             text,
  address           text,
  emergency_name    text,
  emergency_phone   text,
  salary            numeric check (salary is null or salary >= 0),
  pix_key           text,
  bank_name         text,
  bank_agency       text,
  bank_account      text,
  updated_at        timestamptz not null default now()
);

alter table public.workshop_mechanic_private enable row level security;
drop policy if exists mechanic_private_owner on public.workshop_mechanic_private;
create policy mechanic_private_owner on public.workshop_mechanic_private
  for all
  using      (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()));

-- ── Cursos e certificados (com validade) ─────────────────────────────────────
create table if not exists public.workshop_mechanic_certifications (
  id          uuid primary key default uuid_generate_v4(),
  mechanic_id uuid not null references public.workshop_mechanics(id) on delete cascade,
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  name        text not null,
  issued_at   date,
  expires_at  date,
  created_at  timestamptz not null default now()
);
create index if not exists mechanic_certifications_idx on public.workshop_mechanic_certifications (mechanic_id);

alter table public.workshop_mechanic_certifications enable row level security;
drop policy if exists mechanic_certifications_member on public.workshop_mechanic_certifications;
create policy mechanic_certifications_member on public.workshop_mechanic_certifications
  for all
  using      (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

-- ── Documentos (RG, CTPS, contrato…): só o dono ──────────────────────────────
create table if not exists public.workshop_mechanic_documents (
  id          uuid primary key default uuid_generate_v4(),
  mechanic_id uuid not null references public.workshop_mechanics(id) on delete cascade,
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  kind        text not null default 'Outro',
  file_path   text not null,
  file_name   text,
  created_at  timestamptz not null default now()
);
create index if not exists mechanic_documents_idx on public.workshop_mechanic_documents (mechanic_id);

alter table public.workshop_mechanic_documents enable row level security;
drop policy if exists mechanic_documents_owner on public.workshop_mechanic_documents;
create policy mechanic_documents_owner on public.workshop_mechanic_documents
  for all
  using      (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()));

-- Arquivos em bucket próprio e privado: pasta = oficina; só o dono lê/grava
insert into storage.buckets (id, name, public)
values ('team-documents', 'team-documents', false)
on conflict (id) do nothing;

drop policy if exists team_documents_owner_select on storage.objects;
create policy team_documents_owner_select on storage.objects for select
  using (bucket_id = 'team-documents'
         and (public.is_workshop_owner(((storage.foldername(name))[1])::uuid, auth.uid()) or public.is_admin(auth.uid())));

drop policy if exists team_documents_owner_insert on storage.objects;
create policy team_documents_owner_insert on storage.objects for insert
  with check (bucket_id = 'team-documents'
              and public.is_workshop_owner(((storage.foldername(name))[1])::uuid, auth.uid()));

drop policy if exists team_documents_owner_delete on storage.objects;
create policy team_documents_owner_delete on storage.objects for delete
  using (bucket_id = 'team-documents'
         and public.is_workshop_owner(((storage.foldername(name))[1])::uuid, auth.uid()));

-- Fotos dos colaboradores: bucket privado da oficina (os-attachments), pasta team/
