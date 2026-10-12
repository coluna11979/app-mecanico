-- Inbox: setores (Atendimento, Comercial, Financeiro…). Opcional por oficina: sem setor ativo
-- o Inbox continua igual. Conversa nova cai no setor padrão (gatilho abaixo, sem mexer no webhook).
-- `kind` liga o setor às automações do sistema (interessado → comercial, cobrança → financeiro).
-- `roles` = funções do modo balcão que veem o setor (vazio = todas); o Gestor vê tudo.

create table if not exists public.whatsapp_sectors (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  name        text not null,
  icon        text not null default '💬',
  kind        text not null default 'outro' check (kind in ('atendimento', 'comercial', 'financeiro', 'outro')),
  roles       text[] not null default '{}',
  is_default  boolean not null default false,
  active      boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists whatsapp_sectors_workshop_idx on public.whatsapp_sectors (workshop_id, position);
-- Um padrão por oficina
create unique index if not exists whatsapp_sectors_one_default on public.whatsapp_sectors (workshop_id) where is_default;

alter table public.whatsapp_chats
  add column if not exists sector_id uuid references public.whatsapp_sectors(id) on delete set null;
create index if not exists whatsapp_chats_sector_idx on public.whatsapp_chats (workshop_id, sector_id);

alter table public.whatsapp_sectors enable row level security;

drop policy if exists whatsapp_sectors_all on public.whatsapp_sectors;
create policy whatsapp_sectors_all on public.whatsapp_sectors for all
  using (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'inbox'))
  with check (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'inbox'));

revoke all on public.whatsapp_sectors from anon, authenticated;
grant select, insert, update, delete on public.whatsapp_sectors to authenticated;
grant update (sector_id) on public.whatsapp_chats to authenticated;

/* ── Conversa nova entra no setor padrão da oficina ─────────────────────────── */
create or replace function public.trg_whatsapp_chat_default_sector()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sector_id is null then
    select id into new.sector_id from whatsapp_sectors
    where workshop_id = new.workshop_id and is_default and active
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_whatsapp_chat_default_sector on public.whatsapp_chats;
create trigger trg_whatsapp_chat_default_sector
  before insert on public.whatsapp_chats
  for each row execute function public.trg_whatsapp_chat_default_sector();
