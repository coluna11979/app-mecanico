-- Inbox: transferência entre setores com aviso — o setor de destino vê "↪ Veio do Atendimento"
-- e o recado de quem transferiu até alguém abrir a conversa.
alter table public.whatsapp_chats
  add column if not exists transferred_at   timestamptz,
  add column if not exists transferred_from text,
  add column if not exists transfer_note    text;

grant update (transferred_at, transferred_from, transfer_note) on public.whatsapp_chats to authenticated;
