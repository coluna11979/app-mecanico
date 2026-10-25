-- Módulo de Marketing do admin (/admin/marketing):
--   1. Campanhas com link curto rastreável (/c/<slug>) e contagem de cliques
--   2. Atribuição do cadastro (campanha, UTM, cupom) — 1 linha por profile
--   3. Cupons promocionais (código validado no cadastro, uso contado)
--   4. E-mail marketing (disparos, destinatários e descadastro)
-- Tudo admin-only, exceto as RPCs públicas que o site/cadastro chamam.

-- ── 1. Campanhas ────────────────────────────────────────────────────────────
create table if not exists public.marketing_campaigns (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  channel      text not null default 'outro',      -- instagram, facebook, google, panfleto, whatsapp, evento, email, outro
  audience     text not null default 'all' check (audience in ('mechanic', 'workshop', 'all')),
  destination  text not null default '/' check (destination like '/%'),
  utm_source   text,
  utm_medium   text,
  cost         numeric(12,2) not null default 0,
  starts_on    date,
  ends_on      date,
  status       text not null default 'ativa' check (status in ('ativa', 'pausada', 'encerrada')),
  notes        text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists public.marketing_clicks (
  id           bigint generated always as identity primary key,
  campaign_id  uuid not null references public.marketing_campaigns(id) on delete cascade,
  visitor_id   text,
  referrer     text,
  user_agent   text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_mkt_clicks_campaign on public.marketing_clicks(campaign_id, created_at desc);
create index if not exists idx_mkt_clicks_created  on public.marketing_clicks(created_at desc);

-- ── 2. Cupons ───────────────────────────────────────────────────────────────
create table if not exists public.marketing_coupons (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z0-9_-]{3,30}$'),
  description   text not null,                      -- o que a pessoa ganha, em texto pro cadastro
  audience      text not null default 'all' check (audience in ('mechanic', 'workshop', 'all')),
  benefit_type  text not null default 'desconto_taxa'
                check (benefit_type in ('desconto_taxa', 'credito', 'bonus', 'outro')),
  benefit_value numeric(12,2),
  max_uses      int check (max_uses is null or max_uses > 0),
  expires_on    date,
  active        boolean not null default true,
  campaign_id   uuid references public.marketing_campaigns(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ── 3. Atribuição do cadastro ───────────────────────────────────────────────
create table if not exists public.marketing_attributions (
  profile_id    uuid primary key references public.profiles(id) on delete cascade,
  campaign_id   uuid references public.marketing_campaigns(id) on delete set null,
  coupon_id     uuid references public.marketing_coupons(id) on delete set null,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  landing_path  text,
  benefit_applied_at timestamptz,                   -- admin marca quando o benefício do cupom foi dado
  created_at    timestamptz not null default now()
);
create index if not exists idx_mkt_attr_campaign on public.marketing_attributions(campaign_id);
create index if not exists idx_mkt_attr_coupon   on public.marketing_attributions(coupon_id);

alter table public.leads
  add column if not exists campaign_id uuid references public.marketing_campaigns(id) on delete set null;
create index if not exists idx_leads_campaign on public.leads(campaign_id);

-- ── 4. E-mail marketing ─────────────────────────────────────────────────────
create table if not exists public.marketing_email_blasts (
  id          uuid primary key default gen_random_uuid(),
  subject     text not null,
  heading     text not null,
  body        text not null,
  cta_label   text,
  cta_url     text,
  segment     jsonb not null default '{}'::jsonb,   -- {audience, status, state, include_leads}
  status      text not null default 'enviando' check (status in ('enviando', 'enviado', 'erro')),
  recipients  int not null default 0,
  sent        int not null default 0,
  failed      int not null default 0,
  error       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

-- id da linha = token do link de descadastro
create table if not exists public.marketing_email_sends (
  id          uuid primary key default gen_random_uuid(),
  blast_id    uuid not null references public.marketing_email_blasts(id) on delete cascade,
  email       text not null,
  name        text,
  profile_id  uuid references public.profiles(id) on delete set null,
  lead_id     uuid references public.leads(id) on delete set null,
  status      text not null default 'enviado' check (status in ('enviado', 'erro')),
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_mkt_sends_blast on public.marketing_email_sends(blast_id);

create table if not exists public.marketing_unsubscribes (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- ── RLS: admin faz tudo; o público só passa pelas RPCs abaixo ───────────────
do $$
declare t text;
begin
  foreach t in array array['marketing_campaigns', 'marketing_clicks', 'marketing_coupons',
                           'marketing_attributions', 'marketing_email_blasts',
                           'marketing_email_sends', 'marketing_unsubscribes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated
                      using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()))', t);
  end loop;
end $$;

-- ── RPCs públicas ───────────────────────────────────────────────────────────

-- Link curto /c/<slug>: conta o clique e devolve pra onde mandar
create or replace function public.track_campaign_click(
  p_slug text, p_visitor text default null, p_referrer text default null, p_user_agent text default null)
returns table (campaign_id uuid, destination text, utm_source text, utm_medium text, slug text)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare c public.marketing_campaigns;
begin
  select * into c from public.marketing_campaigns mc where mc.slug = lower(trim(p_slug));
  if not found then return; end if;
  if c.status = 'ativa' then
    insert into public.marketing_clicks (campaign_id, visitor_id, referrer, user_agent)
    values (c.id, left(p_visitor, 64), left(p_referrer, 240), left(p_user_agent, 240));
  end if;
  return query select c.id, c.destination, coalesce(c.utm_source, c.channel), coalesce(c.utm_medium, 'link'), c.slug;
end;
$$;

-- Usos de um cupom (cadastros que o resgataram)
create or replace function public.coupon_uses(p_coupon_id uuid) returns int
language sql stable security definer set search_path = public
as $$ select count(*)::int from public.marketing_attributions where coupon_id = p_coupon_id $$;

-- Valida o cupom no cadastro (não consome — o consumo é a atribuição)
create or replace function public.validate_coupon(p_code text, p_audience text)
returns table (id uuid, code text, description text)
language sql stable security definer set search_path = public
as $$
  select c.id, c.code, c.description
    from public.marketing_coupons c
   where c.code = upper(trim(p_code))
     and c.active
     and (c.expires_on is null or c.expires_on >= current_date)
     and (c.audience = 'all' or c.audience = p_audience)
     and (c.max_uses is null or public.coupon_uses(c.id) < c.max_uses);
$$;

-- Grava de onde veio o cadastro. Chamado logo após o signUp; aceita só
-- profiles criados há pouco e sem atribuição, pra não dar pra reescrever histórico.
create or replace function public.attribute_signup(
  p_profile_id uuid, p_campaign_id uuid default null, p_coupon_code text default null,
  p_utm_source text default null, p_utm_medium text default null, p_utm_campaign text default null,
  p_landing_path text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_role text; v_coupon uuid;
begin
  select role::text into v_role from public.profiles
   where id = p_profile_id and created_at > now() - interval '30 minutes';
  if v_role is null then return; end if;
  if auth.uid() is not null and auth.uid() <> p_profile_id then return; end if;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select v.id into v_coupon from public.validate_coupon(p_coupon_code, v_role) v;
  end if;

  if p_campaign_id is null and v_coupon is null and p_utm_source is null then return; end if;

  insert into public.marketing_attributions
    (profile_id, campaign_id, coupon_id, utm_source, utm_medium, utm_campaign, landing_path)
  values (p_profile_id,
          (select id from public.marketing_campaigns where id = p_campaign_id),
          v_coupon, left(p_utm_source, 80), left(p_utm_medium, 80), left(p_utm_campaign, 120),
          left(p_landing_path, 200))
  on conflict (profile_id) do nothing;
end;
$$;

-- Descadastro do e-mail marketing (link no rodapé)
create or replace function public.marketing_unsubscribe(p_token uuid) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_email text;
begin
  select lower(email) into v_email from public.marketing_email_sends where id = p_token;
  if v_email is null then return false; end if;
  insert into public.marketing_unsubscribes (email) values (v_email) on conflict do nothing;
  return true;
end;
$$;

-- ── RPCs do painel (admin) ──────────────────────────────────────────────────

-- Funil por origem: cliques → leads → cadastros → aprovados → 1º serviço concluído
create or replace function public.marketing_funnel(p_from timestamptz, p_to timestamptz default now())
returns table (source text, campaign_id uuid, clicks bigint, leads bigint, signups bigint,
               approved bigint, activated bigint, cost numeric)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;

  return query
  with
  clk as (
    select k.campaign_id, count(*) n from public.marketing_clicks k
     where k.created_at between p_from and p_to group by 1),
  ld as (
    select l.campaign_id,
           case when l.campaign_id is not null then null
                when nullif(trim(l.utm_source), '') is not null then lower(trim(l.utm_source))
                when l.origem::text = 'formulario_site' then 'direto'
                else l.origem::text end as src
      from public.leads l where l.created_at between p_from and p_to),
  sg as (
    select p.id, p.status::text st, a.campaign_id,
           case when a.campaign_id is not null then null
                when nullif(trim(a.utm_source), '') is not null then lower(trim(a.utm_source))
                else 'direto' end as src,
           exists (
             select 1 from public.jobs j
               left join public.mechanics m on m.id = j.mechanic_id
               left join public.workshops w on w.id = j.workshop_id
              where j.status = 'completed' and (m.profile_id = p.id or w.profile_id = p.id)
           ) as act
      from public.profiles p
      left join public.marketing_attributions a on a.profile_id = p.id
     where p.role in ('mechanic', 'workshop') and p.created_at between p_from and p_to),
  keys as (
    select c.id as cid, null::text as src from public.marketing_campaigns c
    union select null, src from ld where campaign_id is null
    union select null, src from sg where campaign_id is null)
  select coalesce(c.name, k.src) as source, k.cid,
         coalesce((select n from clk where clk.campaign_id = k.cid), 0),
         (select count(*) from ld where (k.cid is not null and ld.campaign_id = k.cid) or (k.cid is null and ld.campaign_id is null and ld.src = k.src)),
         (select count(*) from sg where (k.cid is not null and sg.campaign_id = k.cid) or (k.cid is null and sg.campaign_id is null and sg.src = k.src)),
         (select count(*) from sg where sg.st = 'approved' and ((k.cid is not null and sg.campaign_id = k.cid) or (k.cid is null and sg.campaign_id is null and sg.src = k.src))),
         (select count(*) from sg where sg.act and ((k.cid is not null and sg.campaign_id = k.cid) or (k.cid is null and sg.campaign_id is null and sg.src = k.src))),
         coalesce(c.cost, 0)
    from keys k
    left join public.marketing_campaigns c on c.id = k.cid;
end;
$$;

-- Série diária pro gráfico
create or replace function public.marketing_daily(p_from timestamptz, p_to timestamptz default now())
returns table (day date, clicks bigint, leads bigint, signups bigint)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  return query
  select d::date,
         (select count(*) from public.marketing_clicks k where k.created_at >= d and k.created_at < d + interval '1 day'),
         (select count(*) from public.leads l where l.created_at >= d and l.created_at < d + interval '1 day'),
         (select count(*) from public.profiles p where p.role in ('mechanic', 'workshop')
             and p.created_at >= d and p.created_at < d + interval '1 day')
    from generate_series(date_trunc('day', p_from at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo',
                         p_to, interval '1 day') d;
end;
$$;

revoke all on function public.track_campaign_click(text, text, text, text) from public;
revoke all on function public.coupon_uses(uuid) from public;
revoke all on function public.validate_coupon(text, text) from public;
revoke all on function public.attribute_signup(uuid, uuid, text, text, text, text, text) from public;
revoke all on function public.marketing_unsubscribe(uuid) from public;
revoke all on function public.marketing_funnel(timestamptz, timestamptz) from public;
revoke all on function public.marketing_daily(timestamptz, timestamptz) from public;

grant execute on function public.track_campaign_click(text, text, text, text) to anon, authenticated;
grant execute on function public.coupon_uses(uuid) to authenticated;
grant execute on function public.validate_coupon(text, text) to anon, authenticated;
grant execute on function public.attribute_signup(uuid, uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.marketing_unsubscribe(uuid) to anon, authenticated;
grant execute on function public.marketing_funnel(timestamptz, timestamptz) to authenticated;
grant execute on function public.marketing_daily(timestamptz, timestamptz) to authenticated;
