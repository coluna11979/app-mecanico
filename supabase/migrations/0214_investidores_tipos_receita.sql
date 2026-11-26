-- Tipos de receita: sugeridos, com valor do mês digitado (menos a margem das demandas, que é automática).
-- O fechamento passa a somar essas linhas e guarda o detalhe por tipo no retrato do mês.
-- Estrutura: tipos sugeridos pré-cadastrados; os valores começam vazios (nenhum número inventado).

create table if not exists public.investor_revenue_types (
  key    text primary key,
  label  text not null,
  auto   boolean not null default false,      -- true = calculada pelo sistema (somente leitura)
  sort   int not null default 100,
  active boolean not null default true
);
insert into public.investor_revenue_types (key, label, auto, sort) values
  ('demandas',     'Margem das demandas',                  true,  10),
  ('mensalidades', 'Mensalidades (CRM)',                   false, 20),
  ('vip',          'Plano VIP',                            false, 30),
  ('multas',       'Multas de cancelamento (parte da plataforma)', false, 40),
  ('outras',       'Outras receitas',                      false, 90)
on conflict (key) do nothing;

create table if not exists public.investor_revenue_entries (
  month    date not null check (month = date_trunc('month', month)::date),
  type_key text not null references public.investor_revenue_types(key),
  amount   numeric(12,2) not null check (amount >= 0),
  note     text,
  primary key (month, type_key)
);

alter table public.investor_revenue_types   enable row level security;
alter table public.investor_revenue_entries enable row level security;
drop policy if exists investor_revenue_types_admin on public.investor_revenue_types;
create policy investor_revenue_types_admin on public.investor_revenue_types for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists investor_revenue_entries_admin on public.investor_revenue_entries;
create policy investor_revenue_entries_admin on public.investor_revenue_entries for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop trigger if exists investor_revenue_entries_guard on public.investor_revenue_entries;
create trigger investor_revenue_entries_guard before insert or update or delete on public.investor_revenue_entries
  for each row execute function public.investor_guard_closed_month();
drop trigger if exists investor_revenue_entries_audit on public.investor_revenue_entries;
create trigger investor_revenue_entries_audit after insert or update or delete on public.investor_revenue_entries
  for each row execute function public.investor_audit();
drop trigger if exists investor_revenue_types_audit on public.investor_revenue_types;
create trigger investor_revenue_types_audit after insert or update or delete on public.investor_revenue_types
  for each row execute function public.investor_audit();

grant select, insert, update, delete on public.investor_revenue_types, public.investor_revenue_entries to authenticated;

-- O que já estava lançado como "mensalidades" passa para o tipo correspondente
insert into public.investor_revenue_entries (month, type_key, amount, note)
select month, 'mensalidades', amount, note from public.investor_manual_revenue
on conflict do nothing;

/* ── Fechamento: soma as linhas por tipo e guarda o detalhe no retrato ─── */
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
  v_rev  jsonb;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Só o admin.'; end if;
  if m >= date_trunc('month', now())::date then raise exception 'Só dá para fechar meses já encerrados.'; end if;
  if exists (select 1 from public.investor_closings where month = m) then raise exception 'Mês já fechado.'; end if;
  if coalesce(p_reserve, 0) < 0 then raise exception 'Reserva inválida.'; end if;

  v_app  := public.investor_platform_revenue(m);
  v_man  := coalesce((select sum(e.amount) from public.investor_revenue_entries e
                       join public.investor_revenue_types t on t.key = e.type_key and not t.auto
                      where e.month = m), 0);
  v_cost := coalesce((select sum(amount) from public.investor_costs where month = m and category <> 'impostos'), 0);
  v_tax  := coalesce((select sum(amount) from public.investor_costs where month = m and category = 'impostos'), 0);
  v_cats := coalesce((select jsonb_object_agg(category, total) from
              (select category, sum(amount) total from public.investor_costs where month = m group by category) c), '{}'::jsonb);
  v_rev  := jsonb_build_object('Margem das demandas', v_app) || coalesce((
              select jsonb_object_agg(t.label, e.amount)
                from public.investor_revenue_entries e
                join public.investor_revenue_types t on t.key = e.type_key and not t.auto
               where e.month = m and e.amount > 0), '{}'::jsonb);
  v_dist := v_app + v_man - v_cost - v_tax - coalesce(p_reserve, 0);

  insert into public.investor_closings (month, revenue_apps, revenue_manual, costs, taxes, reserve, distributable, snapshot, closed_by)
  values (m, v_app, v_man, v_cost, v_tax, coalesce(p_reserve, 0), v_dist,
          jsonb_build_object('custos_por_categoria', v_cats, 'receitas_por_tipo', v_rev, 'taxa_plataforma_pct',
            (select value from public.app_settings where key = 'platform_fee_percent')), auth.uid());

  insert into public.investor_closing_shares (month, investor_id, pct, amount)
  select m, i.id, i.share_pct, round(greatest(v_dist, 0) * i.share_pct / 100, 2)
    from public.investors i where i.active;

  return jsonb_build_object('month', m, 'distributable', v_dist);
end $$;
