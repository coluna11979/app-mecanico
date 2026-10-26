-- Banners informativos/promocionais nos painéis da oficina e do mecânico.
-- O admin cria em /admin/marketing (aba Banners); cada perfil só lê os
-- banners ativos, dentro do período e do seu público.

create table if not exists public.panel_banners (
  id          uuid primary key default gen_random_uuid(),
  audience    text not null check (audience in ('workshop', 'mechanic', 'all')),
  title       text not null,
  body        text,
  cta_label   text,
  cta_url     text check (cta_url is null or cta_url like '/%' or cta_url like 'https://%'),
  theme       text not null default 'grafite' check (theme in ('grafite', 'laranja', 'claro', 'impacto')),
  badge       text check (badge in ('novidade', 'lancamento', 'promocao', 'aviso')),
  image_url   text,                                  -- arte pronta (substitui o desenho padrão)
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  active      boolean not null default true,
  priority    int not null default 0,
  dismissible boolean not null default true,
  views       int not null default 0,
  clicks      int not null default 0,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_panel_banners_live on public.panel_banners(active, starts_at, ends_at);

alter table public.panel_banners enable row level security;

drop policy if exists admin_all on public.panel_banners;
create policy admin_all on public.panel_banners for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Oficina/mecânico: só o que está no ar e é pro seu público
drop policy if exists read_live on public.panel_banners;
create policy read_live on public.panel_banners for select to authenticated
  using (
    active
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
    and (
      audience = 'all'
      or audience = (select p.role::text from public.profiles p where p.id = auth.uid())
    )
  );

-- Contadores (visto / clicado), sem dar update na tabela pra quem não é admin
create or replace function public.panel_banner_event(p_id uuid, p_kind text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if p_kind = 'view' then
    update public.panel_banners set views = views + 1 where id = p_id and active;
  elsif p_kind = 'click' then
    update public.panel_banners set clicks = clicks + 1 where id = p_id and active;
  end if;
end;
$$;
revoke all on function public.panel_banner_event(uuid, text) from public;
grant execute on function public.panel_banner_event(uuid, text) to authenticated;

-- Imagens dos banners (leitura pública, escrita só admin)
insert into storage.buckets (id, name, public)
values ('panel-banners', 'panel-banners', true)
on conflict (id) do nothing;

drop policy if exists panel_banners_admin_write on storage.objects;
create policy panel_banners_admin_write on storage.objects for all to authenticated
  using (bucket_id = 'panel-banners' and public.is_admin(auth.uid()))
  with check (bucket_id = 'panel-banners' and public.is_admin(auth.uid()));
