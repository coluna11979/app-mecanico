-- Pedidos de compra e de venda de cota feitos pelo investidor no painel.
-- IMPORTANTE: isto NÃO é um mercado. É um pedido de interesse que chega ao admin. Nada é comprado, vendido,
-- cobrado ou transferido pelo sistema: o admin analisa e resolve fora (contrato, regras de cessão, advogado).

create table if not exists public.investor_quota_requests (
  id          uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors(id) on delete cascade,
  kind        text not null check (kind in ('comprar', 'vender')),
  amount      numeric(14,2) not null check (amount > 0),     -- R$ a comprar, ou R$ da cota que quer vender
  note        text,
  status      text not null default 'novo' check (status in ('novo', 'em_analise', 'concluido', 'recusado', 'cancelado')),
  admin_note  text,
  created_at  timestamptz not null default now()
);
create index if not exists investor_quota_requests_inv_idx on public.investor_quota_requests(investor_id, created_at desc);

alter table public.investor_quota_requests enable row level security;
drop policy if exists investor_quota_requests_admin on public.investor_quota_requests;
create policy investor_quota_requests_admin on public.investor_quota_requests for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists investor_quota_requests_self on public.investor_quota_requests;
create policy investor_quota_requests_self on public.investor_quota_requests for select
  using (investor_id = public.my_investor_id());
drop trigger if exists investor_quota_requests_audit on public.investor_quota_requests;
create trigger investor_quota_requests_audit after insert or update or delete on public.investor_quota_requests
  for each row execute function public.investor_audit();
grant select, insert, update, delete on public.investor_quota_requests to authenticated;

-- O investidor só cria pedido por esta função (valida valor e limita pedidos em aberto)
create or replace function public.investor_quota_request(p_kind text, p_amount numeric, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  me     uuid := public.my_investor_id();
  v_mine numeric;
  v_val  numeric;
  v_cap  numeric;
  v_sold numeric;
  v_avail numeric;
begin
  if me is null then raise exception 'Sem acesso.'; end if;
  if p_kind not in ('comprar', 'vender') then raise exception 'Pedido inválido.'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Informe o valor.'; end if;
  if (select count(*) from public.investor_quota_requests where investor_id = me and status in ('novo', 'em_analise')) >= 3 then
    raise exception 'Você já tem pedidos em andamento. Aguarde a equipe responder.';
  end if;

  select amount into v_mine from public.investors where id = me;
  if p_kind = 'vender' then
    if p_amount > v_mine then raise exception 'Você não pode vender mais do que aportou.'; end if;
  else
    select amount into v_val from public.investor_valuation where id = 1;
    if p_amount < 20000 then raise exception 'O valor mínimo é R$ 20.000.'; end if;
    if v_val is not null then
      v_cap  := v_val * coalesce((select value::numeric from public.app_settings where key = 'investors_round1_cap_pct'), 20) / 100;
      v_sold := coalesce((select sum(amount) from public.investors where active), 0);
      v_avail := v_cap - v_sold;
      if p_amount > v_avail then raise exception 'O valor passa do que ainda está disponível na primeira rodada.'; end if;
    end if;
  end if;

  insert into public.investor_quota_requests (investor_id, kind, amount, note)
  values (me, p_kind, round(p_amount, 2), nullif(left(trim(coalesce(p_note, '')), 800), ''));
  return true;
end $$;
revoke all on function public.investor_quota_request(text, numeric, text) from public, anon;
grant execute on function public.investor_quota_request(text, numeric, text) to authenticated;

-- O investidor cancela o próprio pedido enquanto ele ainda está novo
create or replace function public.investor_quota_request_cancel(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.investor_quota_requests set status = 'cancelado'
   where id = p_id and investor_id = public.my_investor_id() and status = 'novo';
  return found;
end $$;
revoke all on function public.investor_quota_request_cancel(uuid) from public, anon;
grant execute on function public.investor_quota_request_cancel(uuid) to authenticated;
