-- Tipo dentro da categoria escolhido no cadastro (pastilha, amortecedor...). Vazio = reconhecido pelo nome.
alter table workshop_parts add column if not exists subcategory text;
