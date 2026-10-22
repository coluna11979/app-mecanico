-- Inbox do WhatsApp (módulo opcional, ligado pelo superadmin só para as oficinas escolhidas).
-- Cada oficina conecta o próprio número (uma instância da UAZAPI, conta da plataforma).
-- Mensagens chegam pelo webhook (edge function whatsapp-webhook) e saem pela whatsapp-send.

/* ── Módulos opcionais: desligados por padrão, ligados por oficina ─────────── */
alter table public.workshop_modules
  add column if not exists enabled_modules text[] not null default '{}';

/** Módulo opcional liberado para a oficina? (ligado e não desligado de vez) */
create or replace function public.workshop_module_enabled(_workshop_id uuid, _module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from workshop_modules
    where workshop_id = _workshop_id
      and _module = any(enabled_modules)
      and not (_module = any(disabled_modules))
  );
$$;
revoke all on function public.workshop_module_enabled(uuid, text) from public, anon;
grant execute on function public.workshop_module_enabled(uuid, text) to authenticated, service_role;

/* ── Número conectado (uma instância por oficina) ──────────────────────────── */
create table if not exists public.whatsapp_instances (
  workshop_id       uuid primary key references public.workshops(id) on delete cascade,
  instance_name     text not null,
  status            text not null default 'disconnected'
                    check (status in ('disconnected', 'connecting', 'connected', 'banned')),
  phone_number      text,
  profile_name      text,
  last_connected_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Token da instância e segredo do webhook: só as edge functions (service role) leem
create table if not exists public.whatsapp_instance_secrets (
  workshop_id    uuid primary key references public.whatsapp_instances(workshop_id) on delete cascade,
  token          text not null,
  webhook_secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);

/* ── Conversas ─────────────────────────────────────────────────────────────── */
create table if not exists public.whatsapp_chats (
  id                   uuid primary key default gen_random_uuid(),
  workshop_id          uuid not null references public.workshops(id) on delete cascade,
  remote_jid           text not null,
  phone                text not null,
  name                 text,
  avatar_url           text,
  customer_id          uuid references public.customers(id) on delete set null,
  status               text not null default 'open' check (status in ('open', 'resolved')),
  unread_count         integer not null default 0,
  /** Primeira mensagem do cliente ainda sem resposta (null = respondido) */
  awaiting_since       timestamptz,
  last_message_at      timestamptz,
  last_message_preview text,
  last_message_from_me boolean,
  resolved_at          timestamptz,
  created_at           timestamptz not null default now(),
  unique (workshop_id, remote_jid)
);
create index if not exists whatsapp_chats_list_idx on public.whatsapp_chats (workshop_id, last_message_at desc);
create index if not exists whatsapp_chats_customer_idx on public.whatsapp_chats (customer_id);

/* ── Mensagens ─────────────────────────────────────────────────────────────── */
create table if not exists public.whatsapp_messages (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references public.workshops(id) on delete cascade,
  chat_id      uuid not null references public.whatsapp_chats(id) on delete cascade,
  /** Id da mensagem no WhatsApp (dedup) */
  message_id   text,
  from_me      boolean not null default false,
  /** Quem respondeu pelo sistema (null = cliente, ou enviada pelo celular) */
  sent_by      uuid references public.profiles(id) on delete set null,
  sent_by_name text,
  content      text,
  message_type text not null default 'text'
               check (message_type in ('text', 'image', 'video', 'audio', 'document', 'sticker', 'other')),
  media_path   text,
  media_mime   text,
  file_name    text,
  status       text not null default 'sent'
               check (status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  is_deleted   boolean not null default false,
  sent_at      timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create unique index if not exists whatsapp_messages_dedup_idx on public.whatsapp_messages (workshop_id, message_id) where message_id is not null;
create index if not exists whatsapp_messages_chat_idx on public.whatsapp_messages (chat_id, sent_at);

/* ── Conversa acompanha a última mensagem ──────────────────────────────────── */
create or replace function public.trg_whatsapp_message_to_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update whatsapp_chats c set
    last_message_at      = greatest(coalesce(c.last_message_at, new.sent_at), new.sent_at),
    last_message_preview = left(coalesce(nullif(new.content, ''), case new.message_type
                             when 'image' then '📷 Foto' when 'video' then '🎥 Vídeo'
                             when 'audio' then '🎤 Áudio' when 'document' then '📄 Documento'
                             when 'sticker' then '🏷️ Figurinha' else 'Mensagem' end), 140),
    last_message_from_me = new.from_me,
    unread_count   = case when new.from_me then 0 else c.unread_count + 1 end,
    awaiting_since = case when new.from_me then null else coalesce(c.awaiting_since, new.sent_at) end,
    -- Cliente voltou a falar → conversa reabre
    status      = case when new.from_me then c.status else 'open' end,
    resolved_at = case when new.from_me then c.resolved_at else null end
  where c.id = new.chat_id
    and (c.last_message_at is null or new.sent_at >= c.last_message_at - interval '1 minute');
  return new;
end;
$$;

drop trigger if exists trg_whatsapp_message_to_chat on public.whatsapp_messages;
create trigger trg_whatsapp_message_to_chat
  after insert on public.whatsapp_messages
  for each row execute function public.trg_whatsapp_message_to_chat();

/* ── Liga o número do WhatsApp ao cliente cadastrado ───────────────────────────
   O WhatsApp às vezes manda celular sem o 9 (55 11 8xxx-xxxx): compara DDD + 8 últimos dígitos. */
create or replace function public.match_customer_by_phone(_workshop_id uuid, _phone text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select regexp_replace(regexp_replace(_phone, '\D', '', 'g'), '^55(?=\d{10,11}$)', '') as d
  )
  select c.id from customers c, p
  where c.workshop_id = _workshop_id
    and length(p.d) >= 10
    and c.phone is not null
    and right(regexp_replace(c.phone, '\D', '', 'g'), 8) = right(p.d, 8)
    and left(regexp_replace(regexp_replace(c.phone, '\D', '', 'g'), '^55(?=\d{10,11}$)', ''), 2) = left(p.d, 2)
  order by c.created_at
  limit 1;
$$;
revoke all on function public.match_customer_by_phone(uuid, text) from public, anon;
grant execute on function public.match_customer_by_phone(uuid, text) to authenticated, service_role;

/* ── RLS: membros da oficina com o módulo liberado ─────────────────────────── */
alter table public.whatsapp_instances        enable row level security;
alter table public.whatsapp_instance_secrets enable row level security;
alter table public.whatsapp_chats            enable row level security;
alter table public.whatsapp_messages         enable row level security;

drop policy if exists whatsapp_instances_read on public.whatsapp_instances;
create policy whatsapp_instances_read on public.whatsapp_instances for select
  using (public.is_admin(auth.uid())
         or (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'inbox')));

drop policy if exists whatsapp_chats_read on public.whatsapp_chats;
create policy whatsapp_chats_read on public.whatsapp_chats for select
  using (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'inbox'));

-- Equipe marca como lida, conclui/reabre e vincula o cliente (mensagens só entram pelas edge functions)
drop policy if exists whatsapp_chats_update on public.whatsapp_chats;
create policy whatsapp_chats_update on public.whatsapp_chats for update
  using (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'inbox'))
  with check (public.is_workshop_member(workshop_id, auth.uid()));

drop policy if exists whatsapp_messages_read on public.whatsapp_messages;
create policy whatsapp_messages_read on public.whatsapp_messages for select
  using (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'inbox'));

-- Supabase dá tudo para authenticated por padrão: aqui só leitura + colunas liberadas
revoke all on public.whatsapp_instances, public.whatsapp_chats, public.whatsapp_messages from anon, authenticated;
grant select on public.whatsapp_instances, public.whatsapp_chats, public.whatsapp_messages to authenticated;
grant update (status, unread_count, customer_id, resolved_at, name) on public.whatsapp_chats to authenticated;
revoke all on public.whatsapp_instance_secrets from anon, authenticated;

/* ── Tempo real ────────────────────────────────────────────────────────────── */
alter table public.whatsapp_chats    replica identity full;
alter table public.whatsapp_messages replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'whatsapp_chats') then
    alter publication supabase_realtime add table public.whatsapp_chats;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'whatsapp_messages') then
    alter publication supabase_realtime add table public.whatsapp_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'whatsapp_instances') then
    alter publication supabase_realtime add table public.whatsapp_instances;
  end if;
end $$;

/* ── Fotos, áudios e documentos (pasta = id da oficina) ────────────────────── */
insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp-media', 'whatsapp-media', false, 52428800)
on conflict (id) do nothing;

drop policy if exists whatsapp_media_read on storage.objects;
create policy whatsapp_media_read on storage.objects for select to authenticated
  using (bucket_id = 'whatsapp-media'
         and public.is_workshop_member(((storage.foldername(name))[1])::uuid, auth.uid()));

-- Anexo enviado pela equipe sobe direto do navegador e a whatsapp-send manda o link
drop policy if exists whatsapp_media_insert on storage.objects;
create policy whatsapp_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'whatsapp-media'
              and public.is_workshop_member(((storage.foldername(name))[1])::uuid, auth.uid())
              and public.workshop_module_enabled(((storage.foldername(name))[1])::uuid, 'inbox'));

/* ── Configuração da UAZAPI (painel admin → Configurações) ─────────────────── */
insert into public.app_settings (key, value, description, is_public) values
  ('uazapi_url', '', 'Endereço do servidor UAZAPI (ex.: https://suaconta.uazapi.com).', false),
  ('uazapi_admin_token', '', 'Admin token da UAZAPI — cria as instâncias das oficinas.', false)
on conflict (key) do nothing;
