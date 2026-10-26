-- "Para você" nos painéis: vitrine de parceiros (benefícios) e artigos (conteúdo).
-- Tudo controlado pelo admin em /admin/marketing; cada perfil lê só o que
-- está publicado para o seu público.

create table if not exists public.panel_partners (
  id          uuid primary key default gen_random_uuid(),
  audience    text not null default 'all' check (audience in ('workshop', 'mechanic', 'all')),
  name        text not null,
  category    text not null default 'outros',
  logo_url    text,
  benefit     text not null,                 -- "10% de desconto em peças"
  description text,
  coupon_code text,
  link_url    text check (link_url is null or link_url like 'https://%'),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  active      boolean not null default true,
  priority    int not null default 0,
  views       int not null default 0,
  clicks      int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.panel_articles (
  id           uuid primary key default gen_random_uuid(),
  audience     text not null default 'all' check (audience in ('workshop', 'mechanic', 'all')),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  title        text not null,
  summary      text,
  category     text not null default 'dicas',
  cover_url    text,
  body         text not null default '',     -- texto simples: parágrafos, "## subtítulo", "- item", links
  published_at timestamptz not null default now(),
  active       boolean not null default true,
  featured     boolean not null default false,
  reads        int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_panel_partners_live on public.panel_partners(active, starts_at, ends_at);
create index if not exists idx_panel_articles_live on public.panel_articles(active, published_at desc);

alter table public.panel_partners enable row level security;
alter table public.panel_articles enable row level security;

drop policy if exists admin_all on public.panel_partners;
create policy admin_all on public.panel_partners for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists admin_all on public.panel_articles;
create policy admin_all on public.panel_articles for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists read_live on public.panel_partners;
create policy read_live on public.panel_partners for select to authenticated
  using (
    active and starts_at <= now() and (ends_at is null or ends_at > now())
    and (audience = 'all' or audience = (select p.role::text from public.profiles p where p.id = auth.uid()))
  );

drop policy if exists read_live on public.panel_articles;
create policy read_live on public.panel_articles for select to authenticated
  using (
    active and published_at <= now()
    and (audience = 'all' or audience = (select p.role::text from public.profiles p where p.id = auth.uid()))
  );

-- Contadores: parceiro (visto/clique) e artigo (leitura)
create or replace function public.panel_content_event(p_kind text, p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if p_kind = 'partner_view' then
    update public.panel_partners set views = views + 1 where id = p_id and active;
  elsif p_kind = 'partner_click' then
    update public.panel_partners set clicks = clicks + 1 where id = p_id and active;
  elsif p_kind = 'article_read' then
    update public.panel_articles set reads = reads + 1 where id = p_id and active;
  end if;
end;
$$;
revoke all on function public.panel_content_event(text, uuid) from public;
grant execute on function public.panel_content_event(text, uuid) to authenticated;
