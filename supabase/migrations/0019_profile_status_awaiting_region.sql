-- Adiciona status "awaiting_region" ao enum profile_status.
-- Usado quando o cadastro é de uma região que ainda não atendemos — o cadastrado
-- fica numa fila separada (não vai pra "rejeitados") pra que o admin consiga
-- enxergar o backlog por cidade/bairro e priorizar expansão.

alter type public.profile_status add value if not exists 'awaiting_region';
