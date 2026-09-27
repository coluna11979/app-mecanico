-- Fluxo de aprovação do orçamento:
-- Aberta → Aguardando aprovação → Aprovada → Em andamento → Concluída
-- (recusado = status 'cancelled' + quote_status 'declined', já existente)

alter type public.os_status add value if not exists 'awaiting_approval' after 'open';
alter type public.os_status add value if not exists 'approved' after 'awaiting_approval';

alter table public.service_orders add column if not exists approval_requested_at timestamptz; -- orçamento enviado ao cliente
alter table public.service_orders add column if not exists approved_at           timestamptz; -- cliente aprovou
alter table public.service_orders add column if not exists approval_channel      text;        -- whatsapp | telefone | presencial
