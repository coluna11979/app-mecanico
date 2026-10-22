-- Conta a pagar com os dados de cada tipo: favorecido (locador, concessionária…),
-- colaborador (salários), competência (mês de referência), código de barras e observação.
alter table public.payables
  add column if not exists payee        text,
  add column if not exists mechanic_id  uuid references public.workshop_mechanics(id) on delete set null,
  add column if not exists competence   text check (competence ~ '^\d{4}-\d{2}$'),   -- "2026-09"
  add column if not exists document     text,                                      -- nº do documento / nota
  add column if not exists barcode      text,                                      -- linha digitável do boleto / guia
  add column if not exists notes        text;
