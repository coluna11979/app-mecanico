-- Demanda com preço pelo serviço ("R$ 50 pelo serviço", não importa o tempo).
-- Para não mexer em nenhuma conta de cobrança (pagamento, taxa, multa, embaixador usam
-- price_per_hour × max_hours), a demanda fixa grava o pacote como valor × 1:
--   price_per_hour = valor do serviço, max_hours = 1, pricing = 'fixed'.
-- O tempo previsto informado pela oficina fica em estimated_hours (só informação).
alter table public.jobs
  add column if not exists pricing         text not null default 'hour' check (pricing in ('hour', 'fixed')),
  add column if not exists estimated_hours numeric(4,1);

comment on column public.jobs.pricing is 'hour = valor/hora × horas; fixed = preço pelo serviço (price_per_hour = total, max_hours = 1)';
comment on column public.jobs.estimated_hours is 'Tempo previsto informado na demanda de preço fechado (pricing = fixed)';
