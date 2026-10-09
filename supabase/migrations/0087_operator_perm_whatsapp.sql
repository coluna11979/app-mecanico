-- Nova permissão do modo balcão: 'whatsapp' (Inbox do WhatsApp da oficina: ver e responder
-- todas as conversas). Só o Gestor tem por padrão; o dono libera por pessoa em Acessos.
alter table public.workshop_operators drop constraint if exists workshop_operators_perms_check;
alter table public.workshop_operators add constraint workshop_operators_perms_check
  check (permissions <@ array[
    'dar_desconto', 'cancelar_recebimento', 'reabrir_caixa',
    'ver_financeiro', 'contas_pagar', 'compras', 'pecas_estoque', 'folha', 'equipe', 'plataforma',
    'whatsapp'
  ]::text[]);
