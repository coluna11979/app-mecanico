-- Documentos no fim do cadastro ("Finalize seu cadastro").
-- Cada arquivo enviado na lista de documentos vira uma mensagem no histórico do cadastro
-- (approval_messages, kind 'reply', sender_role 'user') marcada com o tipo do documento.
-- O admin usa o mesmo campo num "Solicitar docs" (kind 'request_documents') para pedir de
-- novo UM documento específico — ele volta como "precisa reenviar" na lista do cadastrado.
--
-- Tipos: id_front / id_back = CNH ou RG (do mecânico ou do responsável pela oficina),
--        address_proof = comprovante de endereço, cnpj_card = cartão CNPJ (só oficina).
-- As regras de acesso (RLS) da tabela e do bucket approval-attachments não mudam:
-- o cadastrado só grava mensagens dele com sender_role 'user'; admin vê e grava tudo.

alter table public.approval_messages
  add column if not exists doc_type text;

alter table public.approval_messages
  drop constraint if exists approval_messages_doc_type_check;
alter table public.approval_messages
  add constraint approval_messages_doc_type_check
  check (doc_type is null or doc_type in ('id_front', 'id_back', 'address_proof', 'cnpj_card'));

create index if not exists approval_messages_profile_doc_idx
  on public.approval_messages (profile_id, doc_type, created_at desc)
  where doc_type is not null;
