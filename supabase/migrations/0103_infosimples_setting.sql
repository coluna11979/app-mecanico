-- Token da Infosimples (verificação de cadastro de mecânico). Linha criada vazia e
-- privada: is_public tem default true, e um upsert pela tela de Configurações
-- criaria a chave legível por qualquer usuário logado.
insert into public.app_settings (key, value, is_public, description)
values ('infosimples_token', '', false, 'Token da API Infosimples (consulta CPF, antecedentes e mandados)')
on conflict (key) do update set is_public = false;
