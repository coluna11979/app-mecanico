-- Agente de atendimento "Recepção" (módulo 'agentes'): responde o lead no WhatsApp da oficina,
-- dá boas-vindas, faz 2–3 perguntas de sondagem e passa para a equipe com o card do Comercial preenchido.
-- Quem executa é a edge function agent-reception, disparada pelo whatsapp-webhook.
--
-- Regra de ouro: a IA só fala enquanto nenhuma pessoa da equipe falou na conversa.
-- Mensagem da equipe (pelo sistema ou pelo celular) → agent_state = 'off' e a IA não volta mais.

-- 1) Novos templates (followup e posvenda já previstos para as próximas fases)
alter table public.ai_agents drop constraint if exists ai_agents_template_check;
alter table public.ai_agents add constraint ai_agents_template_check
  check (template in ('socio', 'recepcao', 'followup', 'posvenda'));

-- Ajustes do agente que não são o texto das instruções (ex.: {"scope": "site"})
alter table public.ai_agents add column if not exists settings jsonb not null default '{}'::jsonb;

-- 2) Estado da IA em cada conversa
--   agent_state: null = IA nunca entrou · 'active' = IA conversando · 'done' = IA terminou e passou
--                para a equipe · 'off' = equipe assumiu (ou desligou a IA nesta conversa)
alter table public.whatsapp_chats
  add column if not exists agent_template   text,
  add column if not exists agent_state      text check (agent_state in ('active', 'done', 'off')),
  add column if not exists agent_started_at timestamptz,
  add column if not exists agent_replies    integer not null default 0,
  -- trava curta para não responder duas vezes ao mesmo tempo
  add column if not exists agent_busy_until timestamptz;

-- A equipe pode tirar a IA da conversa pelo Inbox ("Assumir")
grant update (agent_state) on public.whatsapp_chats to authenticated;

-- 3) Mensagem escrita pela IA
alter table public.whatsapp_messages add column if not exists by_agent boolean not null default false;

-- 4) Resposta da IA não conta como "respondido": a conversa continua em Aguardando para a equipe
--    (só uma pessoa confirma horário e preço). Mesma função da 0099, com by_agent.
create or replace function public.trg_whatsapp_message_to_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  human_reply boolean := new.from_me and not new.by_agent;
begin
  update whatsapp_chats c set
    last_message_at      = greatest(coalesce(c.last_message_at, new.sent_at), new.sent_at),
    last_message_preview = left(coalesce(nullif(new.content, ''), case new.message_type
                             when 'image' then '📷 Foto' when 'video' then '🎥 Vídeo'
                             when 'audio' then '🎤 Áudio' when 'document' then '📄 Documento'
                             when 'sticker' then '🏷️ Figurinha' else 'Mensagem' end), 140),
    last_message_from_me = new.from_me,
    unread_count   = case when human_reply then 0 when new.from_me then c.unread_count else c.unread_count + 1 end,
    awaiting_since = case when human_reply then null when new.from_me then c.awaiting_since
                          else coalesce(c.awaiting_since, new.sent_at) end,
    status      = case when new.from_me then c.status else 'open' end,
    resolved_at = case when new.from_me then c.resolved_at else null end,
    archived_at   = case when not new.from_me and c.archived_mode = 'reply' then null else c.archived_at end,
    archived_mode = case when not new.from_me and c.archived_mode = 'reply' then null else c.archived_mode end
  where c.id = new.chat_id
    and (c.last_message_at is null or new.sent_at >= c.last_message_at - interval '1 minute');
  return new;
end;
$$;
