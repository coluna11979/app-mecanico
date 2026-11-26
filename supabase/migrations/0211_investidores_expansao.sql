-- Expansão: próximas regiões, cadastradas pelo admin e visíveis ao investidor. Estrutura vazia.
create table if not exists public.investor_expansion (
  id            uuid primary key default gen_random_uuid(),
  region        text not null,
  status        text not null default 'planejada' check (status in ('operando', 'proxima', 'planejada')),
  expected_date date,                 -- previsão (qualquer dia do mês)
  note          text,
  created_at    timestamptz not null default now()
);

alter table public.investor_expansion enable row level security;
drop policy if exists investor_expansion_admin on public.investor_expansion;
create policy investor_expansion_admin on public.investor_expansion for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists investor_expansion_investors on public.investor_expansion;
create policy investor_expansion_investors on public.investor_expansion for select
  using (public.my_investor_id() is not null);

drop trigger if exists investor_expansion_audit on public.investor_expansion;
create trigger investor_expansion_audit after insert or update or delete on public.investor_expansion
  for each row execute function public.investor_audit();

grant select, insert, update, delete on public.investor_expansion to authenticated;
