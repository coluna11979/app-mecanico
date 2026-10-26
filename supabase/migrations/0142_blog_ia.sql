-- Blog público + artigo semanal escrito pela IA (sempre como rascunho para revisão).
--   - panel_articles ganha: public (aparece em /blog), origin (manual/ia),
--     review_status e social_caption (legenda pronta pra rede)
--   - blog_topics: pauta controlada pelo admin
--   - toda segunda 8h (Brasília) o pg_cron chama a função blog-weekly-draft

alter table public.panel_articles
  add column if not exists public         boolean not null default false,
  add column if not exists origin         text not null default 'manual' check (origin in ('manual', 'ia')),
  add column if not exists review_status  text check (review_status in ('aguardando_revisao', 'revisado')),
  add column if not exists social_caption text;

-- Blog público: qualquer visitante lê o que está publicado e marcado como público
drop policy if exists read_public on public.panel_articles;
create policy read_public on public.panel_articles for select to anon, authenticated
  using (public and active and published_at <= now());

create or replace function public.blog_article_read(p_slug text)
returns void
language sql security definer set search_path = public
as $$
  update public.panel_articles set reads = reads + 1
   where slug = p_slug and public and active and published_at <= now();
$$;
revoke all on function public.blog_article_read(text) from public;
grant execute on function public.blog_article_read(text) to anon, authenticated;

-- Pauta
create table if not exists public.blog_topics (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  audience   text not null default 'all' check (audience in ('workshop', 'mechanic', 'all')),
  notes      text,
  used_at    timestamptz,
  article_id uuid references public.panel_articles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.blog_topics enable row level security;
drop policy if exists admin_all on public.blog_topics;
create policy admin_all on public.blog_topics for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Configurações (privadas: só admin lê)
insert into public.app_settings (key, value, is_public) values
  ('blog_ai_enabled', 'true', false),
  ('ai_blog_model', 'claude-haiku-5-5', false),
  ('blog_cron_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), false)
on conflict (key) do nothing;

-- Toda segunda às 11:00 UTC (8:00 em Brasília)
select cron.unschedule('blog-weekly-draft') where exists (select 1 from cron.job where jobname = 'blog-weekly-draft');
select cron.schedule(
  'blog-weekly-draft',
  '0 11 * * 1',
  $job$
  select net.http_post(
    url := 'https://qpwdwjzbgasjsnzpgcyo.supabase.co/functions/v1/blog-weekly-draft',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_settings where key = 'blog_cron_secret')
    ),
    body := '{"source":"cron"}'::jsonb
  );
  $job$
);
