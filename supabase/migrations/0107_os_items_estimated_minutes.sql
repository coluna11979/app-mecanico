-- Tempo estimado (médio) de cada serviço da OS, ajustável na própria OS.
-- Sem valor aqui, vale a média real da oficina, o tempo da tabela de serviços ou o padrão do sistema.

alter table public.service_order_items
  add column if not exists estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0);

comment on column public.service_order_items.estimated_minutes is
  'Tempo estimado deste serviço, em minutos (editável na OS). Nulo = usa a média real / tabela de serviços';
