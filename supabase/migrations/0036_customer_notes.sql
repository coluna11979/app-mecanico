-- Observações internas na ficha do cliente (ex.: "prefere contato à tarde", "frota da empresa X")
alter table public.customers add column if not exists notes text;
