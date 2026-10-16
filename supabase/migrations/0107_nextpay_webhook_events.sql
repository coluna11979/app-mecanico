-- Avisos (webhooks) recebidos da NextPay: guarda a hora de chegada para medir
-- quanto tempo a confirmação do pagamento leva. Só o service role grava/lê.
create table if not exists public.nextpay_webhook_events (
  id           uuid primary key default gen_random_uuid(),
  received_at  timestamptz not null default now(),
  event        text,
  charge_id    text,
  status       text,
  paid_at      timestamptz,
  signature_ok boolean not null default false,
  payload      jsonb
);

create index if not exists nextpay_webhook_events_charge_idx on public.nextpay_webhook_events(charge_id, received_at);

alter table public.nextpay_webhook_events enable row level security;
