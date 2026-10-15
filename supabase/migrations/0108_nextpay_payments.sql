-- Pagamento da demanda pela NextPay (PIX + cartão no checkout hospedado).
-- O fluxo continua igual: pagou → jobs.pix_paid_at (mesmo campo que o stripe-webhook grava).

alter table public.jobs
  add column if not exists payment_gateway        text check (payment_gateway in ('stripe', 'nextpay')),
  add column if not exists payment_method         text check (payment_method in ('card', 'pix')),
  add column if not exists paid_amount            numeric(10,2),
  add column if not exists card_fee_amount        numeric(10,2),
  add column if not exists nextpay_charge_id      text,
  add column if not exists nextpay_pix_charge_id  text,
  add column if not exists nextpay_pix_code       text,
  add column if not exists nextpay_pix_expires_at timestamptz,
  add column if not exists nextpay_pix_url        text,
  add column if not exists nextpay_card_url       text,
  add column if not exists nextpay_card_amount    numeric(10,2);

comment on column public.jobs.paid_amount     is 'Quanto a oficina pagou (serviço + taxa do cartão, quando repassada)';
comment on column public.jobs.card_fee_amount is 'Taxa do cartão repassada à oficina (0 = a plataforma absorveu)';

-- Interruptores no admin (Configurações → Pagamentos). Públicos: a tela da oficina lê.
insert into public.app_settings (key, value, description, is_public) values
  ('payment_gateway',      'stripe', 'Gateway do pagamento da demanda: stripe ou nextpay', true),
  ('card_fee_passthrough', 'false',  'Cobrar a taxa do cartão da oficina (false = taxa por nossa conta no lançamento)', true),
  ('card_fee_percent',     '4.20',   'Taxa do cartão da NextPay (%)', true)
on conflict (key) do nothing;
