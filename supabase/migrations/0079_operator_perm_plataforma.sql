-- Nova permissão do modo balcão: 'plataforma' (módulo Plataforma completo:
-- Demandas, Buscar mecânicos, Mensagens e acompanhamento do serviço). Ex.: dar ao Vendedor.
alter table public.workshop_operators drop constraint if exists workshop_operators_perms_check;
alter table public.workshop_operators add constraint workshop_operators_perms_check
  check (permissions <@ array[
    'dar_desconto', 'cancelar_recebimento', 'reabrir_caixa',
    'ver_financeiro', 'contas_pagar', 'compras', 'pecas_estoque', 'folha', 'equipe', 'plataforma'
  ]::text[]);
