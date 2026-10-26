-- Artigo "só no blog": aparece em /blog e não entra em nenhum painel.
-- A leitura dos painéis (read_audience) já não casa com 'blog'; o blog público
-- continua pela política read_public (public and active).

alter table public.panel_articles drop constraint if exists panel_articles_audience_check;
alter table public.panel_articles add constraint panel_articles_audience_check
  check (audience in ('workshop', 'mechanic', 'all', 'blog'));

-- "Só no blog" sempre é público
update public.panel_articles set public = true where audience = 'blog' and not public;
