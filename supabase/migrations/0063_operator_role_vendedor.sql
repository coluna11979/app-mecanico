-- Nova função no modo balcão: Vendedor (módulo Comercial, clientes, orçamentos e agenda).
alter table public.workshop_operators drop constraint if exists workshop_operators_roles_check;
alter table public.workshop_operators
  add constraint workshop_operators_roles_check
  check (roles <@ array['gestor', 'caixa', 'atendente', 'mecanico', 'vendedor']::text[]);
