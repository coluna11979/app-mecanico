-- Empilhados: por que o serviço saiu da pilha sem virar demanda.
-- "equipe" = a própria loja fez; "cancelado" = o serviço não vai mais ser feito.

alter table public.stacked_services
  add column if not exists removed_reason text
    check (removed_reason is null or removed_reason in ('equipe', 'cancelado'));
