-- Taxas da maquininha (cartão) por oficina, em %: débito, crédito de 1 a 6x e crédito de 7x em diante.
-- Usadas só para ESTIMAR o custo de taxa de cartão na Visão financeira (recebimentos em cartão × taxa).
alter table public.workshop_cost_settings
  add column if not exists card_debit_pct       numeric not null default 0 check (card_debit_pct >= 0),
  add column if not exists card_credit_low_pct  numeric not null default 0 check (card_credit_low_pct >= 0),
  add column if not exists card_credit_high_pct numeric not null default 0 check (card_credit_high_pct >= 0);
