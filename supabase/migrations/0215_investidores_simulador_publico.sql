-- Simulador de participação no formulário público (/investir).
-- O valuation é um número do admin: só sai na página pública se o admin LIGAR o interruptor.
-- A função devolve apenas o valor do valuation (nada de investidores, custos ou receitas).

insert into public.app_settings (key, value, description, is_public) values
  ('investors_form_show_valuation', 'false', 'Mostrar o simulador de participação (valuation) no formulário público de investidores', false)
on conflict (key) do nothing;

create or replace function public.investor_public_valuation()
returns numeric language sql stable security definer set search_path = public as $$
  select v.amount
    from public.investor_valuation v
   where v.id = 1
     and coalesce((select value from public.app_settings where key = 'investors_form_show_valuation'), 'false') = 'true'
$$;

revoke all on function public.investor_public_valuation() from public;
grant execute on function public.investor_public_valuation() to anon, authenticated;
