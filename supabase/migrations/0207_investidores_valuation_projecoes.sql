-- Investidores: valuation inicial (um registro) e projeções por cenário.
-- Só tabelas NOVAS. Estrutura vazia: nenhum número é inventado.
-- O investidor lê o valuation e SÓ o cenário 'base'; conservador e otimista ficam com o admin.

create table if not exists public.investor_valuation (
  id        int primary key default 1 check (id = 1),     -- um único registro
  amount    numeric(14,2) not null check (amount > 0),    -- valuation inicial (R$)
  ref_date  date not null,                                -- data de referência
  basis     text not null,                                -- base usada (ex.: negociado, múltiplo da receita)
  note      text,
  updated_at timestamptz not null default now()
);

create table if not exists public.investor_projections (
  scenario text not null check (scenario in ('conservador', 'base', 'otimista')),
  month    date not null check (month = date_trunc('month', month)::date),
  revenue  numeric(12,2) not null default 0 check (revenue >= 0),
  costs    numeric(12,2) not null default 0 check (costs >= 0),   -- custos + impostos previstos
  note     text,
  primary key (scenario, month)
);

alter table public.investor_valuation   enable row level security;
alter table public.investor_projections enable row level security;

drop policy if exists investor_valuation_admin on public.investor_valuation;
create policy investor_valuation_admin on public.investor_valuation for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists investor_valuation_investors on public.investor_valuation;
create policy investor_valuation_investors on public.investor_valuation for select
  using (public.my_investor_id() is not null);

drop policy if exists investor_projections_admin on public.investor_projections;
create policy investor_projections_admin on public.investor_projections for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists investor_projections_base on public.investor_projections;
create policy investor_projections_base on public.investor_projections for select
  using (scenario = 'base' and public.my_investor_id() is not null);

do $$
declare t text;
begin
  foreach t in array array['investor_valuation', 'investor_projections'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.investor_audit()',
                   t || '_audit', t);
  end loop;
end $$;

grant select, insert, update, delete on public.investor_valuation, public.investor_projections to authenticated;
