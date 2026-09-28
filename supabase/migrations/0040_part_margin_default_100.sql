-- Margem padrão das peças passa de 40% para 100% sobre o custo (custo R$ 100 → venda R$ 200).
alter table public.workshop_pricing alter column part_margin_percent set default 100;
