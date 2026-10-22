-- Inbox: arquivar conversa que não é de cliente (propaganda, fornecedor, banco…).
-- Arquivada sai da lista e dos números (Aguardando/Urgentes). Modo:
--   'reply'  = volta sozinha se a pessoa mandar mensagem de novo
--   'always' = não é cliente: fica arquivada mesmo com mensagem nova
alter table public.whatsapp_chats
  add column if not exists archived_at   timestamptz,
  add column if not exists archived_mode text check (archived_mode in ('reply', 'always')),
  add column if not exists archived_by   text;

grant update (archived_at, archived_mode, archived_by) on public.whatsapp_chats to authenticated;

-- Mesma regra de antes + desarquiva no modo 'reply' quando o contato escreve
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
    status      = case when new.from_me then c.status else 'open' end,
    resolved_at = case when new.from_me then c.resolved_at else null end,
    archived_at   = case when not new.from_me and c.archived_mode = 'reply' then null else c.archived_at end,
    archived_mode = case when not new.from_me and c.archived_mode = 'reply' then null else c.archived_mode end
  where c.id = new.chat_id
    and (c.last_message_at is null or new.sent_at >= c.last_message_at - interval '1 minute');
  return new;
end;
$$;

-- Interessados marcados antes de ativar os setores vão para o Comercial
update public.whatsapp_chats c set sector_id = s.id
from public.whatsapp_sectors s
where s.workshop_id = c.workshop_id and s.kind = 'comercial' and s.active
  and c.lead_at is not null and c.sector_id is distinct from s.id;
