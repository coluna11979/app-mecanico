-- Relógio por serviço: cada trecho de trabalho passa a poder apontar para o serviço (item da OS) que estava sendo feito.
-- Trechos antigos (sem serviço) continuam valendo como "por responsável".

alter table public.service_order_work_logs
  add column if not exists service_order_item_id uuid references public.service_order_items(id) on delete set null;

comment on column public.service_order_work_logs.service_order_item_id is
  'Serviço (item da OS) em que o trabalho foi feito. Nulo = trecho antigo, contado por responsável';

create index if not exists service_order_work_logs_item_idx
  on public.service_order_work_logs(service_order_item_id) where service_order_item_id is not null;
