-- Serviço (item da OS) ligado à demanda da plataforma + "empilhados" (aguardando a gestão gerar a demanda).
-- Antes só a OS apontava para a demanda (jobs.service_order_id); com isso dá para saber exatamente
-- qual mecânico fez cada serviço (retorno/garantia) e juntar serviços de várias OS numa demanda só.

alter table public.service_order_items
  add column if not exists platform_job_id uuid references public.jobs(id) on delete set null,
  add column if not exists stacked_at timestamptz;

comment on column public.service_order_items.platform_job_id is
  'Demanda (jobs) em que este serviço foi publicado — o mecânico da demanda é quem fez o serviço';
comment on column public.service_order_items.stacked_at is
  'Quando o serviço foi empilhado (marcado para o mecânico da plataforma, ainda sem demanda). Limpo ao gerar a demanda';

create index if not exists service_order_items_platform_job_idx
  on public.service_order_items(platform_job_id) where platform_job_id is not null;
create index if not exists service_order_items_stack_idx
  on public.service_order_items(workshop_id) where stacked_at is not null and platform_job_id is null;
