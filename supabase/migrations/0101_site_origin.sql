-- Site da oficina → CRM
-- Conversa do WhatsApp que começou pelo site da oficina ("Vim pelo site…") fica marcada com a origem,
-- vira Interessado no Comercial e o cliente cadastrado a partir dela nasce com customers.source = 'site'.
-- Só vale para oficinas com o módulo opcional `site` ligado (workshop_modules.enabled_modules).

alter table public.whatsapp_chats add column if not exists source    text;        -- 'site' | null
alter table public.whatsapp_chats add column if not exists source_at timestamptz; -- primeiro contato pelo site

create index if not exists whatsapp_chats_source_idx
  on public.whatsapp_chats (workshop_id, source_at) where source is not null;

comment on column public.whatsapp_chats.source    is 'Origem da conversa: site = começou pelo site da oficina';
comment on column public.customers.source         is 'app | paper_import | site';
