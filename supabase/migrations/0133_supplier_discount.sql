-- Desconto de acordo com o fornecedor (ex.: 15% em todas as peças das notas dele).
-- A tela "Lançar nota" aplica nos custos das peças e o total/contas a pagar já saem com o desconto.
-- (aplicada em produção como 0122_supplier_discount, com os 4 fornecedores da Jota Car em 15%)
alter table public.suppliers
  add column if not exists discount_percent numeric not null default 0
  check (discount_percent >= 0 and discount_percent < 100);
