-- Comercial: "Interessados" — conversa do WhatsApp marcada como oportunidade antes de existir
-- orçamento (ex.: "quanto fica a embreagem?"). Sai do funil sozinha quando o cliente ganha
-- uma OS ou um check-up depois de lead_at (a tela Comercial confere).
alter table public.whatsapp_chats
  add column if not exists lead_at    timestamptz,
  add column if not exists lead_note  text,
  add column if not exists lead_value numeric(12, 2),
  add column if not exists lead_by    text;

create index if not exists whatsapp_chats_lead_idx on public.whatsapp_chats (workshop_id, lead_at)
  where lead_at is not null;

grant update (lead_at, lead_note, lead_value, lead_by) on public.whatsapp_chats to authenticated;
