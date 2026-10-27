-- Peça que é um item da OS por si só (vendida com preço e estoque), mesmo estando depois de um serviço.
-- Sem isso, toda peça pertence ao serviço de cima (só custo/estoque, sem preço de venda).

alter table public.service_order_items
  add column if not exists standalone boolean not null default false;

comment on column public.service_order_items.standalone is
  'Só peças: true = item próprio da OS (preço de venda), não pertence ao serviço que vem antes dela';
