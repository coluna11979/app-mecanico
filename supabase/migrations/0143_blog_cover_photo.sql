-- Capa com foto (Pixabay) para os artigos do blog.
-- A chave fica privada (app_settings.is_public = false): o padrão da tabela é público,
-- então a linha é criada aqui antes de o admin colar a chave.

alter table public.panel_articles
  add column if not exists cover_query  text,   -- o que buscar (sugerido pela IA)
  add column if not exists cover_credit text;   -- "Foto: Fulano / Pixabay"

insert into public.app_settings (key, value, is_public) values ('pixabay_api_key', '', false)
on conflict (key) do update set is_public = false;

update public.app_settings set is_public = false where key in ('ai_blog_model', 'blog_ai_enabled');
