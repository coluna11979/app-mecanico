-- Inbox: botões das mensagens (ex.: "Clique Aqui" com o link da reunião, "Parar mensagens").
-- [{ "text": "Clique Aqui", "url": "https://…" }, { "text": "Parar mensagens" }]
alter table public.whatsapp_messages add column if not exists buttons jsonb;
