-- Nova permissão do modo balcão: 'consultas' (Busca rápida: consultar preço e consulta de óleo e filtros).
-- Gestor já tem tudo; o dono libera por pessoa em Acessos (ex.: o gerente que entra como Caixa/Atendente).
alter table public.workshop_operators drop constraint if exists workshop_operators_perms_check;
alter table public.workshop_operators add constraint workshop_operators_perms_check
  check (permissions <@ array[
    'dar_desconto', 'cancelar_recebimento', 'reabrir_caixa',
    'ver_financeiro', 'contas_pagar', 'compras', 'pecas_estoque', 'folha', 'equipe', 'plataforma',
    'whatsapp', 'consultas'
  ]::text[]);
