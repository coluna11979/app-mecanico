-- Margem por categoria de peça: { "freios": 80, "oleos_filtros": 60, ... } (em % sobre o custo).
-- Vale para peça sem margem própria/preço fixo; categoria fora da lista usa a margem padrão.
alter table public.workshop_pricing
  add column if not exists category_margins jsonb not null default '{}'::jsonb;
