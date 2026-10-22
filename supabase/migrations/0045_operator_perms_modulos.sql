-- Permissões por módulo no modo balcão: "Ver financeiro" liberava tudo de uma vez.
-- Agora cada tela tem a sua; ver_financeiro passa a ser só o painel (saúde do negócio).

alter table public.workshop_operators drop constraint if exists workshop_operators_perms_check;
alter table public.workshop_operators add constraint workshop_operators_perms_check
  check (permissions <@ array[
    'dar_desconto', 'cancelar_recebimento', 'reabrir_caixa',
    'ver_financeiro', 'contas_pagar', 'compras', 'pecas_estoque', 'folha'
  ]::text[]);

-- Quem já tinha "Ver financeiro" continua vendo as mesmas telas
update public.workshop_operators
   set permissions = array(select distinct unnest(permissions || array['contas_pagar', 'compras', 'pecas_estoque', 'folha']::text[])),
       updated_at = now()
 where 'ver_financeiro' = any(permissions);
