-- Ferramentas do Inbox: biblioteca de materiais (fotos, vídeos, PDFs e áudios que a oficina manda sempre),
-- respostas rápidas e notas internas da conversa. Arquivos no bucket whatsapp-media, pasta <oficina>/materials/.

create table if not exists public.whatsapp_materials (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  title       text not null,
  description text,
  kind        text not null check (kind in ('image', 'video', 'document', 'audio')),
  media_path  text not null,
  media_mime  text not null,
  file_name   text,
  size_bytes  bigint,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists whatsapp_materials_workshop_idx on public.whatsapp_materials (workshop_id, created_at desc);

alter table public.whatsapp_materials enable row level security;

drop policy if exists whatsapp_materials_read on public.whatsapp_materials;
create policy whatsapp_materials_read on public.whatsapp_materials for select
  using (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'inbox'));

drop policy if exists whatsapp_materials_insert on public.whatsapp_materials;
create policy whatsapp_materials_insert on public.whatsapp_materials for insert
  with check (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'inbox')
              and media_path like workshop_id::text || '/materials/%');

drop policy if exists whatsapp_materials_update on public.whatsapp_materials;
create policy whatsapp_materials_update on public.whatsapp_materials for update
  using (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'inbox'))
  with check (public.is_workshop_member(workshop_id, auth.uid()));

drop policy if exists whatsapp_materials_delete on public.whatsapp_materials;
create policy whatsapp_materials_delete on public.whatsapp_materials for delete
  using (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'inbox'));

revoke all on public.whatsapp_materials from anon, authenticated;
grant select, insert, delete on public.whatsapp_materials to authenticated;
grant update (title, description) on public.whatsapp_materials to authenticated;

-- Apagar o arquivo junto com o material (só a pasta de materiais; mídias das conversas ficam)
drop policy if exists whatsapp_media_delete_materials on storage.objects;
create policy whatsapp_media_delete_materials on storage.objects for delete to authenticated
  using (bucket_id = 'whatsapp-media'
         and (storage.foldername(name))[2] = 'materials'
         and public.is_workshop_member(((storage.foldername(name))[1])::uuid, auth.uid())
         and public.workshop_module_enabled(((storage.foldername(name))[1])::uuid, 'inbox'));

/* ── Respostas rápidas (atalho /oi, /pix, /endereco…) ──────────────────────── */
create table if not exists public.whatsapp_quick_replies (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  shortcut    text not null check (shortcut ~ '^[a-z0-9_-]{1,30}$'),
  title       text not null,
  body        text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (workshop_id, shortcut)
);

alter table public.whatsapp_quick_replies enable row level security;

drop policy if exists whatsapp_quick_replies_all on public.whatsapp_quick_replies;
create policy whatsapp_quick_replies_all on public.whatsapp_quick_replies for all
  using (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'inbox'))
  with check (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'inbox'));

revoke all on public.whatsapp_quick_replies from anon, authenticated;
grant select, insert, update, delete on public.whatsapp_quick_replies to authenticated;

/* ── Notas internas da conversa (só a equipe vê) ──────────────────────────── */
create table if not exists public.whatsapp_chat_notes (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  chat_id     uuid not null references public.whatsapp_chats(id) on delete cascade,
  body        text not null,
  tag         text check (tag in ('atencao', 'importante', 'retorno')),
  created_by  uuid references public.profiles(id) on delete set null,
  author_name text,
  created_at  timestamptz not null default now()
);
create index if not exists whatsapp_chat_notes_chat_idx on public.whatsapp_chat_notes (chat_id, created_at desc);

alter table public.whatsapp_chat_notes enable row level security;

drop policy if exists whatsapp_chat_notes_read on public.whatsapp_chat_notes;
create policy whatsapp_chat_notes_read on public.whatsapp_chat_notes for select
  using (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'inbox'));

drop policy if exists whatsapp_chat_notes_insert on public.whatsapp_chat_notes;
create policy whatsapp_chat_notes_insert on public.whatsapp_chat_notes for insert
  with check (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'inbox')
              and exists (select 1 from public.whatsapp_chats c where c.id = chat_id and c.workshop_id = whatsapp_chat_notes.workshop_id));

drop policy if exists whatsapp_chat_notes_delete on public.whatsapp_chat_notes;
create policy whatsapp_chat_notes_delete on public.whatsapp_chat_notes for delete
  using (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'inbox'));

revoke all on public.whatsapp_chat_notes from anon, authenticated;
grant select, insert, delete on public.whatsapp_chat_notes to authenticated;
