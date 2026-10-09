-- Inbox: "Lembrar de retornar" — a conversa volta para o topo no dia marcado
-- (ex.: cobrar o orçamento que o cliente ficou de pensar).
alter table public.whatsapp_chats
  add column if not exists follow_up_at   timestamptz,
  add column if not exists follow_up_note text,
  add column if not exists follow_up_by   text;

create index if not exists whatsapp_chats_follow_up_idx on public.whatsapp_chats (workshop_id, follow_up_at)
  where follow_up_at is not null;

grant update (follow_up_at, follow_up_note, follow_up_by) on public.whatsapp_chats to authenticated;
