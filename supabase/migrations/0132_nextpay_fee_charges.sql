-- Multa de cancelamento paga pela NextPay (PIX ou cartão), quando payment_gateway = nextpay.
-- Cada linha = uma cobrança gerada para quitar as multas em aberto da oficina naquele momento.
-- Quem marca as multas como pagas é o nextpay-webhook (charge.paid confirmado na API),
-- nunca a tela da oficina. Só o service role lê/grava.
create table if not exists public.nextpay_fee_charges (
  id             uuid primary key default gen_random_uuid(),
  workshop_id    uuid not null references public.workshops(id) on delete cascade,
  method         text not null check (method in ('pix', 'card')),
  service_amount numeric(10,2) not null,  -- soma das multas
  amount         numeric(10,2) not null,  -- cobrado (multa + taxa do cartão, se repassada)
  job_ids        uuid[] not null,
  charge_id      text,
  pix_code       text,
  payment_url    text,
  expires_at     timestamptz,
  paid_at        timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists nextpay_fee_charges_ws_idx on public.nextpay_fee_charges(workshop_id, created_at desc);

alter table public.nextpay_fee_charges enable row level security;
