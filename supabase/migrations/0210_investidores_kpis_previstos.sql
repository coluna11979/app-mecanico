-- KPIs previstos por mês (cenário base), digitados pelo admin. Estrutura vazia: nenhum número inventado.
-- O investidor lê (só quantidades e totais; nada de oficina, mecânico ou cliente).
create table if not exists public.investor_kpi_projections (
  month         date primary key check (month = date_trunc('month', month)::date),
  mechanics_new int not null default 0 check (mechanics_new >= 0),   -- mecânicos cadastrados no mês
  workshops_new int not null default 0 check (workshops_new >= 0),   -- oficinas cadastradas no mês
  jobs          int not null default 0 check (jobs >= 0),            -- demandas públicas publicadas
  gross         numeric(14,2) not null default 0 check (gross >= 0), -- faturamento bruto previsto
  note          text
);

alter table public.investor_kpi_projections enable row level security;
drop policy if exists investor_kpi_admin on public.investor_kpi_projections;
create policy investor_kpi_admin on public.investor_kpi_projections for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists investor_kpi_investors on public.investor_kpi_projections;
create policy investor_kpi_investors on public.investor_kpi_projections for select
  using (public.my_investor_id() is not null);

drop trigger if exists investor_kpi_projections_audit on public.investor_kpi_projections;
create trigger investor_kpi_projections_audit after insert or update or delete on public.investor_kpi_projections
  for each row execute function public.investor_audit();

grant select, insert, update, delete on public.investor_kpi_projections to authenticated;
