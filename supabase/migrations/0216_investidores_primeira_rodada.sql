-- Primeira rodada: teto de captação = % do valuation (padrão 20%), valor mínimo R$ 20 mil por pessoa.
-- "Vendido" = soma dos aportes dos investidores ativos. Disponível = teto − vendido.
-- O formulário público só mostra a rodada quando o admin liga o simulador (mesmo interruptor do valuation).
-- Os números expostos são agregados (valuation, teto, total captado): nada de nomes.

insert into public.app_settings (key, value, description, is_public) values
  ('investors_round1_cap_pct', '20', 'Teto da primeira rodada de investidores, em % do valuation', false)
on conflict (key) do nothing;

-- Substitui a função anterior (só devolvia o valuation)
drop function if exists public.investor_public_valuation();

create or replace function public.investor_public_round()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'valuation', v.amount,
           'cap_pct',   coalesce((select value::numeric from public.app_settings where key = 'investors_round1_cap_pct'), 20),
           'sold',      coalesce((select sum(amount) from public.investors where active), 0))
    from public.investor_valuation v
   where v.id = 1
     and coalesce((select value from public.app_settings where key = 'investors_form_show_valuation'), 'false') = 'true'
$$;
revoke all on function public.investor_public_round() from public;
grant execute on function public.investor_public_round() to anon, authenticated;

-- Para o investidor logado: andamento da rodada e a posição dele (senso de pertencimento)
create or replace function public.investor_round_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.my_investor_id();
begin
  if me is null then return null; end if;
  return jsonb_build_object(
    'valuation', (select amount from public.investor_valuation where id = 1),
    'cap_pct',   coalesce((select value::numeric from public.app_settings where key = 'investors_round1_cap_pct'), 20),
    'sold',      coalesce((select sum(amount) from public.investors where active), 0),
    'count',     (select count(*) from public.investors where active),
    'rank',      1 + (select count(*) from public.investors i, public.investors m
                       where m.id = me and i.active and (i.invested_at, i.created_at) < (m.invested_at, m.created_at)));
end $$;
revoke all on function public.investor_round_status() from public, anon;
grant execute on function public.investor_round_status() to authenticated;

-- Envio do formulário: valor mínimo e respeito ao que ainda está disponível na rodada
create or replace function public.investor_interest_submit(p jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_name  text := left(trim(coalesce(p->>'name', '')), 120);
  v_email text := lower(left(trim(coalesce(p->>'email', '')), 160));
  v_phone text := left(trim(coalesce(p->>'phone', '')), 30);
  v_amount numeric;
  v_exp   text[];
  v_round jsonb := public.investor_public_round();
  v_avail numeric;
begin
  if coalesce(p->>'website', '') <> '' then return true; end if;

  if length(v_name) < 3 then raise exception 'Informe seu nome.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Informe um e-mail válido.'; end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 10 then raise exception 'Informe um WhatsApp com DDD.'; end if;
  if coalesce(p->>'consent', 'false') <> 'true' then raise exception 'É preciso autorizar o uso dos seus dados para o contato.'; end if;
  if coalesce(p->>'risk_ack', 'false') <> 'true' then raise exception 'Confirme que leu o aviso de riscos.'; end if;

  begin
    v_amount := nullif(trim(coalesce(p->>'amount', '')), '')::numeric;
  exception when others then
    raise exception 'Valor de investimento inválido.';
  end;
  if v_amount is null or v_amount < 20000 then raise exception 'O valor mínimo é R$ 20.000.'; end if;
  if v_round is not null then
    v_avail := (v_round->>'valuation')::numeric * (v_round->>'cap_pct')::numeric / 100 - (v_round->>'sold')::numeric;
    if v_avail < 20000 then raise exception 'A primeira rodada está completa. Entraremos em contato se abrir uma nova.'; end if;
    if v_amount > v_avail then raise exception 'O valor passa do que ainda está disponível nesta fase.'; end if;
  end if;

  if (select count(*) from public.investor_interests where lower(email) = v_email and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Recebemos seu interesse. Aguarde nosso contato.';
  end if;
  if (select count(*) from public.investor_interests where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Muitos envios agora. Tente novamente mais tarde.';
  end if;

  select coalesce(array_agg(left(x, 40)), '{}') into v_exp
    from (select jsonb_array_elements_text(coalesce(p->'experience', '[]'::jsonb)) x limit 8) t;

  insert into public.investor_interests (name, email, phone, city, source, investor_type, sector, experience, goal, amount_range,
                                         amount, instrument, horizon, contact_pref, message, risk_ack, consent)
  values (v_name, v_email, v_phone, nullif(left(trim(coalesce(p->>'city', '')), 80), ''),
          nullif(left(trim(coalesce(p->>'source', '')), 60), ''),
          nullif(p->>'investor_type', ''), nullif(p->>'sector', ''), v_exp, nullif(p->>'goal', ''), nullif(p->>'amount_range', ''),
          v_amount, nullif(p->>'instrument', ''), nullif(p->>'horizon', ''), nullif(p->>'contact_pref', ''),
          nullif(left(trim(coalesce(p->>'message', '')), 1500), ''), true, true);
  return true;
end $$;
revoke all on function public.investor_interest_submit(jsonb) from public;
grant execute on function public.investor_interest_submit(jsonb) to anon, authenticated;
