-- Números do dia para o painel do investidor: SÓ QUANTIDADES e totais agregados, nada de linha, nome ou id.
-- Investidor ativo (ou admin) chama; ninguém lê as tabelas de origem por aqui. Dia/mês no fuso de São Paulo.
-- Faturamento bruto = serviço pago pelas oficinas nas demandas (sem taxa do cartão, sem crédito de incentivo,
-- menos estornos). NÃO é receita da plataforma: a receita é a margem, que só vale depois do fechamento do mês.

create or replace function public.investor_live_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  tz       constant text := 'America/Sao_Paulo';
  v_day    timestamptz := date_trunc('day',   now() at time zone tz) at time zone tz;
  v_month  timestamptz := date_trunc('month', now() at time zone tz) at time zone tz;
  v_gross_day numeric; v_gross_month numeric;
begin
  if public.my_investor_id() is null and not public.is_admin(auth.uid()) then
    raise exception 'Sem acesso.';
  end if;

  with paid as (
    select j.pix_paid_at,
           greatest(coalesce(j.paid_amount, 0) - coalesce(j.card_fee_amount, 0)
             - coalesce((select -sum(e.amount) from public.workshop_wallet_entries e
                          where e.job_id = j.id and e.kind = 'job_payment' and e.bucket = 'credit'), 0)
             - coalesce((select sum(e.amount) from public.workshop_wallet_entries e
                          where e.job_id = j.id and e.kind = 'refund'), 0), 0) as v
      from public.jobs j
     where j.pix_paid_at >= v_month
  )
  select coalesce(sum(v) filter (where pix_paid_at >= v_day), 0), coalesce(sum(v), 0)
    into v_gross_day, v_gross_month from paid;

  return jsonb_build_object(
    'mechanics_today',  (select count(*) from public.profiles where role = 'mechanic' and created_at >= v_day),
    'mechanics_month',  (select count(*) from public.profiles where role = 'mechanic' and created_at >= v_month),
    'mechanics_total',  (select count(*) from public.profiles where role = 'mechanic'),
    'workshops_today',  (select count(*) from public.profiles where role = 'workshop' and created_at >= v_day),
    'workshops_month',  (select count(*) from public.profiles where role = 'workshop' and created_at >= v_month),
    'workshops_total',  (select count(*) from public.profiles where role = 'workshop'),
    'jobs_today',       (select count(*) from public.jobs where audience = 'public' and created_at >= v_day),
    'jobs_month',       (select count(*) from public.jobs where audience = 'public' and created_at >= v_month),
    'jobs_paid_today',  (select count(*) from public.jobs where pix_paid_at >= v_day),
    'gross_today',      round(v_gross_day, 2),
    'gross_month',      round(v_gross_month, 2),
    'generated_at',     now()
  );
end $$;

revoke all on function public.investor_live_stats() from public, anon;
grant execute on function public.investor_live_stats() to authenticated;
