-- Módulo Investidores (admin). Só tabelas NOVAS: não altera nada das oficinas, mecânicos ou demandas.
-- Investidor NÃO é sócio: vê só números agregados do app (nada de oficina, mecânico ou cliente — LGPD).
-- O sistema não movimenta dinheiro: só registra o que o admin pagou.
--
-- Receita (somente leitura): margem do app nas demandas pagas no mês, descontando o que foi pago com
-- CRÉDITO de incentivo da carteira (crédito liberado pelo admin não é dinheiro entrando).
-- Mensalidades do CRM não têm cobrança no sistema: entram à mão em investor_manual_revenue.

/* ── Liga/desliga global (mesmo padrão do wallet_enabled) ─────────────── */
insert into public.app_settings (key, value, description, is_public) values
  ('investors_enabled', 'false', 'Módulo Investidores ligado (admin)', false)
on conflict (key) do nothing;

/* ── Investidores ─────────────────────────────────────────────────────── */
create table if not exists public.investors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete set null,  -- login próprio (e-mail de acesso)
  name        text not null,
  email       text not null,
  amount      numeric(12,2) not null check (amount > 0),                 -- aporte
  invested_at date not null,
  instrument  text not null check (instrument in ('mutuo_conversivel', 'investidor_anjo')),
  conditions  text,                                                      -- campo livre: % do resultado, teto, desconto…
  share_pct   numeric(5,2) not null default 0 check (share_pct between 0 and 100), -- % do resultado distribuível
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.investor_documents (
  id          uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors(id) on delete cascade,
  name        text not null,
  path        text not null,            -- bucket 'investors': docs/<investor_id>/arquivo
  created_at  timestamptz not null default now()
);

/* ── Custos (lançamento manual) ───────────────────────────────────────── */
create table if not exists public.investor_costs (
  id           uuid primary key default gen_random_uuid(),
  month        date not null check (month = date_trunc('month', month)::date),   -- 1º dia do mês
  category     text not null check (category in ('equipe', 'anuncios', 'sistemas', 'contador_juridico',
                                                 'taxa_pagamento', 'impostos', 'comissao_embaixadores', 'outros')),
  description  text,
  amount       numeric(12,2) not null check (amount > 0),
  receipt_path text,                    -- bucket 'investors': costs/arquivo
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists investor_costs_month_idx on public.investor_costs(month);

/* ── Mensalidades do CRM (entrada manual por mês) ─────────────────────── */
create table if not exists public.investor_manual_revenue (
  month  date primary key check (month = date_trunc('month', month)::date),
  amount numeric(12,2) not null check (amount >= 0),
  note   text
);

/* ── Fechamento mensal (congelado) ────────────────────────────────────── */
create table if not exists public.investor_closings (
  month         date primary key check (month = date_trunc('month', month)::date),
  revenue_apps  numeric(12,2) not null,
  revenue_manual numeric(12,2) not null,
  costs         numeric(12,2) not null,   -- custos sem impostos
  taxes         numeric(12,2) not null,   -- categoria 'impostos'
  reserve       numeric(12,2) not null,
  distributable numeric(12,2) not null,   -- receita − custos − impostos − reserva
  snapshot      jsonb not null,           -- retrato: custos por categoria, linhas de receita
  closed_at     timestamptz not null default now(),
  closed_by     uuid references auth.users(id) on delete set null
);

create table if not exists public.investor_closing_shares (
  month       date not null references public.investor_closings(month),
  investor_id uuid not null references public.investors(id),
  pct         numeric(5,2) not null,
  amount      numeric(12,2) not null,
  primary key (month, investor_id)
);

/* ── Pagamentos registrados pelo admin ────────────────────────────────── */
create table if not exists public.investor_payments (
  id           uuid primary key default gen_random_uuid(),
  investor_id  uuid not null references public.investors(id) on delete cascade,
  paid_at      date not null,
  amount       numeric(12,2) not null check (amount > 0),
  receipt_path text,                      -- bucket 'investors': payments/<investor_id>/arquivo
  note         text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

/* ── Auditoria (só inserção) ──────────────────────────────────────────── */
create table if not exists public.investor_audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  table_name text not null,
  action     text not null,
  row_data   jsonb
);

create or replace function public.investor_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.investor_audit_log (user_id, table_name, action, row_data)
  values (auth.uid(), tg_table_name, tg_op, to_jsonb(case when tg_op = 'DELETE' then old else new end));
  return coalesce(new, old);
end $$;

create or replace function public.investor_block_change() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Registro congelado: não pode ser alterado nem apagado.';
end $$;

-- Fechamento, partes e log nunca mudam
drop trigger if exists investor_closings_frozen on public.investor_closings;
create trigger investor_closings_frozen before update or delete on public.investor_closings
  for each row execute function public.investor_block_change();
drop trigger if exists investor_shares_frozen on public.investor_closing_shares;
create trigger investor_shares_frozen before update or delete on public.investor_closing_shares
  for each row execute function public.investor_block_change();
drop trigger if exists investor_audit_frozen on public.investor_audit_log;
create trigger investor_audit_frozen before update or delete on public.investor_audit_log
  for each row execute function public.investor_block_change();

-- Mês fechado não aceita custo nem mensalidade nova/alterada
create or replace function public.investor_guard_closed_month() returns trigger
language plpgsql set search_path = public as $$
declare m date := coalesce(new.month, old.month);
begin
  if exists (select 1 from public.investor_closings where month = m) then
    raise exception 'O mês % já está fechado.', to_char(m, 'MM/YYYY');
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists investor_costs_guard on public.investor_costs;
create trigger investor_costs_guard before insert or update or delete on public.investor_costs
  for each row execute function public.investor_guard_closed_month();
drop trigger if exists investor_manual_guard on public.investor_manual_revenue;
create trigger investor_manual_guard before insert or update or delete on public.investor_manual_revenue
  for each row execute function public.investor_guard_closed_month();

do $$
declare t text;
begin
  foreach t in array array['investors', 'investor_documents', 'investor_costs', 'investor_manual_revenue',
                           'investor_closings', 'investor_closing_shares', 'investor_payments'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.investor_audit()',
                   t || '_audit', t);
  end loop;
end $$;

/* ── RLS ──────────────────────────────────────────────────────────────── */
create or replace function public.my_investor_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.investors where user_id = auth.uid() and active
$$;

alter table public.investors               enable row level security;
alter table public.investor_documents      enable row level security;
alter table public.investor_costs          enable row level security;
alter table public.investor_manual_revenue enable row level security;
alter table public.investor_closings       enable row level security;
alter table public.investor_closing_shares enable row level security;
alter table public.investor_payments       enable row level security;
alter table public.investor_audit_log      enable row level security;

-- Admin faz tudo (menos o que os triggers congelam)
do $$
declare t text;
begin
  foreach t in array array['investors', 'investor_documents', 'investor_costs', 'investor_manual_revenue',
                           'investor_closings', 'investor_closing_shares', 'investor_payments'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()))',
                   t || '_admin', t);
  end loop;
end $$;
drop policy if exists investor_audit_admin on public.investor_audit_log;
create policy investor_audit_admin on public.investor_audit_log for select using (public.is_admin(auth.uid()));

-- Investidor: só as próprias linhas
drop policy if exists investors_self on public.investors;
create policy investors_self on public.investors for select using (id = public.my_investor_id());
drop policy if exists investor_documents_self on public.investor_documents;
create policy investor_documents_self on public.investor_documents for select using (investor_id = public.my_investor_id());
drop policy if exists investor_payments_self on public.investor_payments;
create policy investor_payments_self on public.investor_payments for select using (investor_id = public.my_investor_id());
drop policy if exists investor_shares_self on public.investor_closing_shares;
create policy investor_shares_self on public.investor_closing_shares for select using (investor_id = public.my_investor_id());
-- Fechamentos são agregados (sem nomes): todo investidor ativo lê. Custos linha a linha (descrições) NÃO.
drop policy if exists investor_closings_investors on public.investor_closings;
create policy investor_closings_investors on public.investor_closings for select using (public.my_investor_id() is not null);

/* ── Receita do app no mês (somente leitura, só admin) ────────────────── */
create or replace function public.investor_platform_revenue(p_month date)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_fee  numeric := coalesce((select value::numeric from public.app_settings where key = 'platform_fee_percent'), 20);
  v_from timestamptz := date_trunc('month', p_month)::timestamptz;
  v_total numeric;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Só o admin.'; end if;
  -- Base = o que a oficina pagou pelo serviço (sem a taxa do cartão) − crédito de incentivo usado.
  select coalesce(sum(greatest(
           coalesce(j.paid_amount, 0) - coalesce(j.card_fee_amount, 0)
           - coalesce((select -sum(e.amount) from public.workshop_wallet_entries e
                        where e.job_id = j.id and e.kind = 'job_payment' and e.bucket = 'credit'), 0)
           - coalesce((select sum(e.amount) from public.workshop_wallet_entries e
                        where e.job_id = j.id and e.kind = 'refund'), 0),
         0)), 0) * v_fee / 100
    into v_total
    from public.jobs j
   where j.pix_paid_at >= v_from and j.pix_paid_at < v_from + interval '1 month';
  return round(v_total, 2);
end $$;

/* ── Fechar o mês ─────────────────────────────────────────────────────── */
create or replace function public.investor_close_month(p_month date, p_reserve numeric default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m      date := date_trunc('month', p_month)::date;
  v_app  numeric(12,2);
  v_man  numeric(12,2);
  v_cost numeric(12,2);
  v_tax  numeric(12,2);
  v_dist numeric(12,2);
  v_cats jsonb;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Só o admin.'; end if;
  if m >= date_trunc('month', now())::date then raise exception 'Só dá para fechar meses já encerrados.'; end if;
  if exists (select 1 from public.investor_closings where month = m) then raise exception 'Mês já fechado.'; end if;
  if coalesce(p_reserve, 0) < 0 then raise exception 'Reserva inválida.'; end if;

  v_app  := public.investor_platform_revenue(m);
  v_man  := coalesce((select amount from public.investor_manual_revenue where month = m), 0);
  v_cost := coalesce((select sum(amount) from public.investor_costs where month = m and category <> 'impostos'), 0);
  v_tax  := coalesce((select sum(amount) from public.investor_costs where month = m and category = 'impostos'), 0);
  v_cats := coalesce((select jsonb_object_agg(category, total) from
              (select category, sum(amount) total from public.investor_costs where month = m group by category) c), '{}'::jsonb);
  v_dist := v_app + v_man - v_cost - v_tax - coalesce(p_reserve, 0);

  insert into public.investor_closings (month, revenue_apps, revenue_manual, costs, taxes, reserve, distributable, snapshot, closed_by)
  values (m, v_app, v_man, v_cost, v_tax, coalesce(p_reserve, 0), v_dist,
          jsonb_build_object('custos_por_categoria', v_cats, 'taxa_plataforma_pct',
            (select value from public.app_settings where key = 'platform_fee_percent')), auth.uid());

  -- Parte de cada investidor: % do resultado distribuível (nada quando negativo)
  insert into public.investor_closing_shares (month, investor_id, pct, amount)
  select m, i.id, i.share_pct, round(greatest(v_dist, 0) * i.share_pct / 100, 2)
    from public.investors i where i.active;

  return jsonb_build_object('month', m, 'distributable', v_dist);
end $$;

revoke all on function public.investor_platform_revenue(date)        from public, anon;
revoke all on function public.investor_close_month(date, numeric)    from public, anon;
revoke all on function public.my_investor_id()                       from public, anon;
grant execute on function public.investor_platform_revenue(date)     to authenticated;
grant execute on function public.investor_close_month(date, numeric) to authenticated;
grant execute on function public.my_investor_id()                    to authenticated;

/* ── Arquivos privados (documentos e comprovantes) ────────────────────── */
insert into storage.buckets (id, name, public) values ('investors', 'investors', false)
on conflict (id) do nothing;

drop policy if exists "investors_files_admin" on storage.objects;
create policy "investors_files_admin" on storage.objects for all
  using (bucket_id = 'investors' and public.is_admin(auth.uid()))
  with check (bucket_id = 'investors' and public.is_admin(auth.uid()));
-- Investidor lê só a própria pasta (docs/<id>/ e payments/<id>/); comprovantes de custo ficam só com o admin
drop policy if exists "investors_files_self" on storage.objects;
create policy "investors_files_self" on storage.objects for select
  using (bucket_id = 'investors' and public.my_investor_id() is not null
         and (storage.foldername(name))[2] = public.my_investor_id()::text
         and (storage.foldername(name))[1] in ('docs', 'payments'));

/* ── Permissões de tabela (a RLS acima é quem limita as linhas) ───────── */
grant select, insert, update, delete on
  public.investors, public.investor_documents, public.investor_costs, public.investor_manual_revenue,
  public.investor_closings, public.investor_closing_shares, public.investor_payments to authenticated;
grant select on public.investor_audit_log to authenticated;

/* ── Vínculo do login: o investidor entra com o e-mail cadastrado pelo admin ── */
create or replace function public.investor_claim() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then return null; end if;
  update public.investors set user_id = auth.uid()
   where user_id is null and active
     and lower(email) = lower((select email from auth.users where id = auth.uid()))
  returning id into v_id;
  return coalesce(v_id, public.my_investor_id());
end $$;
revoke all on function public.investor_claim() from public, anon;
grant execute on function public.investor_claim() to authenticated;
