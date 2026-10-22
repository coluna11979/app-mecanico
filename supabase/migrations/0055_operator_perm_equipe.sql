-- Nova permissão do modo balcão: 'equipe' (Colaboradores + Desempenho e comissões).
alter table public.workshop_operators drop constraint if exists workshop_operators_perms_check;
alter table public.workshop_operators add constraint workshop_operators_perms_check
  check (permissions <@ array[
    'dar_desconto', 'cancelar_recebimento', 'reabrir_caixa',
    'ver_financeiro', 'contas_pagar', 'compras', 'pecas_estoque', 'folha', 'equipe'
  ]::text[]);
