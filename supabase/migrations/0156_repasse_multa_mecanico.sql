-- Multa de cancelamento: 80% vão para o mecânico, paga pela oficina ou perdoada pela plataforma
-- (perdoada: a plataforma absorve). Campos próprios de propósito: jobs.repasse_pago_at dispara a
-- comissão de embaixador sobre o valor inteiro do serviço, o que não vale para multa.
-- Também guarda os cancelamentos por atraso do mecânico (passou do prazo de chegada).
-- Só acrescenta colunas e índices. Histórico não é marcado: vale a partir de agora.

alter table public.jobs
  add column if not exists fee_repasse_pago_at  timestamptz,
  add column if not exists fee_repasse_valor    numeric(10,2),
  add column if not exists mechanic_late_cancel boolean not null default false;

comment on column public.jobs.fee_repasse_pago_at is 'Admin pagou ao mecânico a parte dele na multa de cancelamento';
comment on column public.jobs.fee_repasse_valor is 'Valor pago ao mecânico da multa de cancelamento (80% da multa)';
comment on column public.jobs.mechanic_late_cancel is 'Oficina cancelou porque o mecânico passou do prazo de chegada';

create index if not exists jobs_fee_repasse_pending_idx on public.jobs (cancelled_at)
  where coalesce(cancellation_fee, 0) > 0 and fee_repasse_pago_at is null;

create index if not exists jobs_mechanic_late_cancel_idx on public.jobs (mechanic_id)
  where mechanic_late_cancel;
