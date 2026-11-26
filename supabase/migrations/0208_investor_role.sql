-- Papel próprio para o investidor (não é oficina nem mecânico).
-- O cadastro automático (handle_new_user) só cria perfil para mechanic/workshop/admin, então uma conta
-- 'investor' NÃO gera oficina fantasma: o perfil dela é criado pelo admin (edge function de convite, próximo passo).
-- ADD VALUE precisa ir sozinho: o valor novo só pode ser usado depois que esta migration terminar.
alter type public.user_role add value if not exists 'investor';
