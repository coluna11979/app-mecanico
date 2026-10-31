-- Carteira da oficina (saldo pré-pago para pagar demandas da plataforma).
-- Quem controla o saldo somos nós: a NextPay só recebe o depósito; o resto é este extrato.
--
-- Extrato (workshop_wallet_entries): uma linha por movimento, nunca apagada; saldo = soma.
--   bucket 'cash'   = dinheiro que a oficina depositou (pode pedir de volta)
--   bucket 'credit' = crédito liberado pela plataforma (incentivo/investidor; só vale para demandas)
-- Pagar com saldo usa o crédito primeiro, depois o dinheiro.
-- Ninguém grava direto: só pelas funções abaixo (oficina paga, admin lança, webhook credita depósito).
-- Liga/desliga em Admin → Configurações → Carteira (wallet_enabled).

/* ── Depósitos pela NextPay ───────────────────────────────────────────── */
create table if not exists public.workshop_wallet_deposits (
  id             uuid primary key default gen_random_uuid(),
  workshop_id    uuid not null references public.workshops(id) on delete cascade,
  method         text not null check (method in ('pix', 'card')),
  amount         numeric(10,2) not null check (amount > 0),  -- entra no saldo
  charged_amount numeric(10,2) not null,                     -- cobrado (+ taxa do cartão, se repassada)
  charge_id      text,
  pix_code       text,
  payment_url    text,
  expires_at     timestamptz,
  paid_at        timestamptz,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists workshop_wallet_deposits_ws_idx on public.workshop_wallet_deposits(workshop_id, created_at desc);
alter table public.workshop_wallet_deposits enable row level security;

/* ── Extrato ──────────────────────────────────────────────────────────── */
create table if not exists public.workshop_wallet_entries (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  kind        text not null check (kind in ('deposit', 'credit', 'job_payment', 'refund', 'withdrawal', 'adjustment')),
  bucket      text not null check (bucket in ('cash', 'credit')),
  amount      numeric(10,2) not null check (amount <> 0),  -- + entra, − sai
  job_id      uuid references public.jobs(id) on delete set null,
  deposit_id  uuid references public.workshop_wallet_deposits(id) on delete set null,
  note        text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists workshop_wallet_entries_ws_idx on public.workshop_wallet_entries(workshop_id, created_at desc);
-- Uma demanda não é paga/estornada duas vezes; um depósito não entra duas vezes
create unique index if not exists workshop_wallet_entries_job_uq
  on public.workshop_wallet_entries(job_id, kind, bucket) where job_id is not null and kind in ('job_payment', 'refund');
create unique index if not exists workshop_wallet_entries_deposit_uq
  on public.workshop_wallet_entries(deposit_id) where deposit_id is not null;

alter table public.workshop_wallet_entries enable row level security;
drop policy if exists "wallet_entries_read" on public.workshop_wallet_entries;
create policy "wallet_entries_read" on public.workshop_wallet_entries for select
  using (public.is_workshop_member(workshop_id, auth.uid()) or public.is_admin(auth.uid()));

-- A tela da oficina atualiza o saldo sozinha
alter table public.workshop_wallet_entries replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'workshop_wallet_entries') then
    alter publication supabase_realtime add table public.workshop_wallet_entries;
  end if;
end $$;

/* ── Demanda paga com saldo ───────────────────────────────────────────── */
do $$
declare c text;
begin
  for c in select conname from pg_constraint
    where conrelid = 'public.jobs'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%payment_gateway%' or pg_get_constraintdef(oid) ilike '%payment_method%')
  loop
    execute format('alter table public.jobs drop constraint %I', c);
  end loop;
end $$;
alter table public.jobs add constraint jobs_payment_gateway_check check (payment_gateway in ('stripe', 'nextpay', 'wallet'));
alter table public.jobs add constraint jobs_payment_method_check  check (payment_method in ('card', 'pix', 'wallet'));

/* ── Saldo ────────────────────────────────────────────────────────────── */
create or replace function public.wallet_balance(p_workshop_id uuid)
returns table (cash numeric, credit numeric, total numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount) filter (where bucket = 'cash'), 0)::numeric(10,2),
         coalesce(sum(amount) filter (where bucket = 'credit'), 0)::numeric(10,2),
         coalesce(sum(amount), 0)::numeric(10,2)
  from public.workshop_wallet_entries
  where workshop_id = p_workshop_id
    and (public.is_workshop_member(p_workshop_id, auth.uid()) or public.is_admin(auth.uid()) or auth.role() = 'service_role');
$$;

/** Valor em reais para os avisos, ex.: "1.250,00" (to_char do banco sai com ponto decimal) */
create or replace function public.wallet_brl(n numeric)
returns text language sql immutable set search_path = public as $$
  select translate(to_char(n, 'FM999G999G990D00'), ',.', '.,');
$$;

/** Aviso no sino do dono da oficina */
create or replace function public.wallet_notify(p_workshop_id uuid, p_title text, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, title, body, type, icon, link)
  select profile_id, p_title, p_body, 'info', '💰', '/oficina/carteira'
  from public.workshops where id = p_workshop_id and profile_id is not null;
$$;

/* ── Oficina paga a demanda com saldo ─────────────────────────────────── */
create or replace function public.wallet_pay_job(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  j        public.jobs%rowtype;
  v_amount numeric(10,2);
  v_cash   numeric(10,2);
  v_credit numeric(10,2);
  v_use_credit numeric(10,2);
  v_use_cash   numeric(10,2);
begin
  if coalesce((select value from public.app_settings where key = 'wallet_enabled'), 'false') <> 'true' then
    raise exception 'A carteira não está liberada.';
  end if;

  select * into j from public.jobs where id = p_job_id for update;
  if not found then raise exception 'Demanda não encontrada.'; end if;
  if not public.is_workshop_member(j.workshop_id, auth.uid()) then raise exception 'Só a oficina da demanda pode pagar.'; end if;
  if j.pix_paid_at is not null then raise exception 'Esta demanda já foi paga.'; end if;
  if j.status <> 'assigned' then raise exception 'Esta demanda não está aguardando pagamento.'; end if;

  -- Mesmo valor do nextpay-charge: valor/hora × horas
  v_amount := round(coalesce(j.price_per_hour, 0) * coalesce(j.max_hours, 1), 2);
  if v_amount < 1 then raise exception 'Valor do serviço inválido.'; end if;

  -- Trava a carteira desta oficina (dois cliques / duas abas não gastam o mesmo saldo)
  perform 1 from public.workshops where id = j.workshop_id for update;
  select coalesce(sum(amount) filter (where bucket = 'cash'), 0),
         coalesce(sum(amount) filter (where bucket = 'credit'), 0)
    into v_cash, v_credit
    from public.workshop_wallet_entries where workshop_id = j.workshop_id;
  if v_cash + v_credit < v_amount then raise exception 'Saldo insuficiente.'; end if;

  v_use_credit := least(greatest(v_credit, 0), v_amount);
  v_use_cash   := v_amount - v_use_credit;
  if v_use_credit > 0 then
    insert into public.workshop_wallet_entries (workshop_id, kind, bucket, amount, job_id, note, created_by)
    values (j.workshop_id, 'job_payment', 'credit', -v_use_credit, j.id, j.title, auth.uid());
  end if;
  if v_use_cash > 0 then
    insert into public.workshop_wallet_entries (workshop_id, kind, bucket, amount, job_id, note, created_by)
    values (j.workshop_id, 'job_payment', 'cash', -v_use_cash, j.id, j.title, auth.uid());
  end if;

  update public.jobs set
    pix_paid_at = now(), payment_gateway = 'wallet', payment_method = 'wallet',
    paid_amount = v_amount, card_fee_amount = 0
  where id = j.id;

  return jsonb_build_object('paid', v_amount, 'balance', v_cash + v_credit - v_amount);
end $$;

/* ── Estorno de cancelamento volta para a carteira (cancel-job, service role) ── */
-- O dinheiro volta como dinheiro até o que foi pago em dinheiro; o resto volta como crédito.
create or replace function public.wallet_refund_job(p_job_id uuid, p_refund numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  j      public.jobs%rowtype;
  v_paid_cash numeric(10,2);
  v_cash      numeric(10,2);
  v_credit    numeric(10,2);
begin
  select * into j from public.jobs where id = p_job_id;
  if not found or coalesce(p_refund, 0) <= 0 then return; end if;
  select coalesce(-sum(amount), 0) into v_paid_cash from public.workshop_wallet_entries
    where job_id = j.id and kind = 'job_payment' and bucket = 'cash';
  v_cash   := least(round(p_refund, 2), v_paid_cash);
  v_credit := round(p_refund, 2) - v_cash;
  if v_cash > 0 then
    insert into public.workshop_wallet_entries (workshop_id, kind, bucket, amount, job_id, note)
    values (j.workshop_id, 'refund', 'cash', v_cash, j.id, 'Estorno: ' || j.title)
    on conflict do nothing;
  end if;
  if v_credit > 0 then
    insert into public.workshop_wallet_entries (workshop_id, kind, bucket, amount, job_id, note)
    values (j.workshop_id, 'refund', 'credit', v_credit, j.id, 'Estorno: ' || j.title)
    on conflict do nothing;
  end if;
  perform public.wallet_notify(j.workshop_id, 'Estorno na carteira',
    'R$ ' || public.wallet_brl(p_refund) || ' voltaram para sua carteira (cancelamento de "' || j.title || '").');
end $$;

/* ── Depósito pago (nextpay-webhook, service role) ────────────────────── */
create or replace function public.wallet_credit_deposit(p_deposit_id uuid, p_charge_id text, p_paid_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare d public.workshop_wallet_deposits%rowtype;
begin
  select * into d from public.workshop_wallet_deposits where id = p_deposit_id for update;
  if not found or d.paid_at is not null then return; end if;
  update public.workshop_wallet_deposits set paid_at = coalesce(p_paid_at, now()), charge_id = coalesce(p_charge_id, charge_id)
    where id = d.id;
  insert into public.workshop_wallet_entries (workshop_id, kind, bucket, amount, deposit_id, note, created_by)
  values (d.workshop_id, 'deposit', 'cash', d.amount, d.id, case d.method when 'pix' then 'Depósito por PIX' else 'Depósito no cartão' end, d.created_by)
  on conflict do nothing;
  perform public.wallet_notify(d.workshop_id, 'Depósito confirmado',
    'R$ ' || public.wallet_brl(d.amount) || ' adicionados à sua carteira.');
end $$;

/* ── Admin: liberar crédito, ajustar, registrar saque ─────────────────── */
create or replace function public.wallet_admin_entry(p_workshop_id uuid, p_kind text, p_bucket text, p_amount numeric, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_bal numeric(10,2);
begin
  if not public.is_admin(auth.uid()) then raise exception 'Só o admin.'; end if;
  if p_kind not in ('credit', 'withdrawal', 'adjustment') then raise exception 'Tipo inválido.'; end if;
  if p_bucket not in ('cash', 'credit') then raise exception 'Saldo inválido.'; end if;
  if coalesce(p_amount, 0) = 0 then raise exception 'Informe o valor.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Informe o motivo.'; end if;
  if p_kind = 'credit' and (p_bucket <> 'credit' or p_amount < 0) then raise exception 'Crédito liberado é sempre positivo.'; end if;
  if p_kind = 'withdrawal' and (p_bucket <> 'cash' or p_amount > 0) then raise exception 'Saque sai do dinheiro da oficina.'; end if;

  perform 1 from public.workshops where id = p_workshop_id for update;
  select coalesce(sum(amount), 0) into v_bal from public.workshop_wallet_entries
    where workshop_id = p_workshop_id and bucket = p_bucket;
  if v_bal + p_amount < 0 then raise exception 'O saldo ficaria negativo.'; end if;

  insert into public.workshop_wallet_entries (workshop_id, kind, bucket, amount, note, created_by)
  values (p_workshop_id, p_kind, p_bucket, round(p_amount, 2), trim(p_note), auth.uid());

  if p_kind = 'credit' then
    perform public.wallet_notify(p_workshop_id, 'Crédito liberado na sua carteira',
      'Você recebeu R$ ' || public.wallet_brl(p_amount) || ' de crédito para usar nas demandas da plataforma.');
  elsif p_kind = 'withdrawal' then
    perform public.wallet_notify(p_workshop_id, 'Saque realizado',
      'R$ ' || public.wallet_brl(-p_amount) || ' da sua carteira foram transferidos para você.');
  end if;
end $$;

/** Admin: saldo de todas as oficinas que já movimentaram a carteira */
create or replace function public.wallet_admin_overview()
returns table (workshop_id uuid, business_name text, cash numeric, credit numeric, total numeric, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select w.id, w.business_name,
         coalesce(sum(e.amount) filter (where e.bucket = 'cash'), 0)::numeric(10,2),
         coalesce(sum(e.amount) filter (where e.bucket = 'credit'), 0)::numeric(10,2),
         coalesce(sum(e.amount), 0)::numeric(10,2),
         max(e.created_at)
  from public.workshop_wallet_entries e
  join public.workshops w on w.id = e.workshop_id
  where public.is_admin(auth.uid())
  group by w.id, w.business_name
  order by max(e.created_at) desc;
$$;

revoke all on function public.wallet_balance(uuid)                                  from public, anon;
revoke all on function public.wallet_notify(uuid, text, text)                       from public, anon, authenticated;
revoke all on function public.wallet_pay_job(uuid)                                  from public, anon;
revoke all on function public.wallet_refund_job(uuid, numeric)                      from public, anon, authenticated;
revoke all on function public.wallet_credit_deposit(uuid, text, timestamptz)        from public, anon, authenticated;
revoke all on function public.wallet_admin_entry(uuid, text, text, numeric, text)   from public, anon;
revoke all on function public.wallet_admin_overview()                               from public, anon;
grant execute on function public.wallet_balance(uuid)                                to authenticated, service_role;
grant execute on function public.wallet_notify(uuid, text, text)                     to service_role;
grant execute on function public.wallet_pay_job(uuid)                               to authenticated;
grant execute on function public.wallet_refund_job(uuid, numeric)                   to service_role;
grant execute on function public.wallet_credit_deposit(uuid, text, timestamptz)     to service_role;
grant execute on function public.wallet_admin_entry(uuid, text, text, numeric, text) to authenticated;
grant execute on function public.wallet_admin_overview()                            to authenticated;

/* ── Configurações (públicas: a tela da oficina lê) ───────────────────── */
insert into public.app_settings (key, value, description, is_public) values
  ('wallet_enabled',     'false', 'Carteira da oficina ligada (saldo pré-pago para pagar demandas)', true),
  ('wallet_min_deposit', '50',    'Depósito mínimo na carteira (R$)', true),
  ('wallet_low_balance', '100',   'Abaixo deste saldo o painel avisa a oficina (R$)', true)
on conflict (key) do nothing;
