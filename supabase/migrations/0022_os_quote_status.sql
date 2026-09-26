-- Orçamento que o cliente não aprovou (não entra no faturamento; vira oportunidade de venda).
-- A OS fica com status 'cancelled' (fora das contas de receita) e quote_status = 'declined'.
alter table public.service_orders add column if not exists quote_status text
  check (quote_status in ('declined'));

create index if not exists service_orders_quote_declined_idx
  on public.service_orders (workshop_id) where quote_status = 'declined';
