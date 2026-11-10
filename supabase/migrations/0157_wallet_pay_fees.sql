-- Multa de cancelamento paga com o saldo DEPOSITADO da carteira (bucket 'cash').
-- O crédito liberado pela plataforma continua valendo só para demandas.
-- Só acrescenta: um tipo de movimento, um índice e uma função. Nada existente muda.

alter table public.workshop_wallet_entries drop constraint if exists workshop_wallet_entries_kind_check;
alter table public.workshop_wallet_entries add constraint workshop_wallet_entries_kind_check
  check (kind in ('deposit', 'credit', 'job_payment', 'refund', 'withdrawal', 'adjustment', 'fee_payment'));

-- Uma multa não é paga duas vezes pela carteira
create unique index if not exists workshop_wallet_entries_fee_uq
  on public.workshop_wallet_entries(job_id) where job_id is not null and kind = 'fee_payment';

create or replace function public.wallet_pay_fees(p_workshop_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_total numeric(10,2);
  v_count integer;
  v_cash  numeric(10,2);
begin
  if coalesce((select value from public.app_settings where key = 'wallet_enabled'), 'false') <> 'true' then
    raise exception 'A carteira não está liberada.';
  end if;
  if not public.is_workshop_member(p_workshop_id, auth.uid()) then
    raise exception 'Só a própria oficina pode pagar a multa.';
  end if;

  -- Trava a carteira desta oficina (dois cliques / duas abas não gastam o mesmo saldo)
  perform 1 from public.workshops where id = p_workshop_id for update;

  -- Trava as multas em aberto: o mesmo critério de workshop_pending_fees
  perform 1 from public.jobs
   where workshop_id = p_workshop_id and coalesce(cancellation_fee, 0) > 0
     and cancellation_fee_paid_at is null and cancellation_fee_waived_at is null
   for update;

  select coalesce(sum(cancellation_fee), 0)::numeric(10,2), count(*) into v_total, v_count
    from public.jobs
   where workshop_id = p_workshop_id and coalesce(cancellation_fee, 0) > 0
     and cancellation_fee_paid_at is null and cancellation_fee_waived_at is null;
  if v_count = 0 then raise exception 'Não há multa em aberto.'; end if;

  select coalesce(sum(amount), 0) into v_cash from public.workshop_wallet_entries
   where workshop_id = p_workshop_id and bucket = 'cash';
  if v_cash < v_total then raise exception 'Saldo depositado insuficiente.'; end if;

  insert into public.workshop_wallet_entries (workshop_id, kind, bucket, amount, job_id, note, created_by)
  select workshop_id, 'fee_payment', 'cash', -cancellation_fee, id, 'Multa: ' || title, auth.uid()
    from public.jobs
   where workshop_id = p_workshop_id and coalesce(cancellation_fee, 0) > 0
     and cancellation_fee_paid_at is null and cancellation_fee_waived_at is null;

  update public.jobs set cancellation_fee_paid_at = now()
   where workshop_id = p_workshop_id and coalesce(cancellation_fee, 0) > 0
     and cancellation_fee_paid_at is null and cancellation_fee_waived_at is null;

  return jsonb_build_object('paid', v_total, 'count', v_count, 'cash', v_cash - v_total);
end $$;

revoke all on function public.wallet_pay_fees(uuid) from public, anon;
grant execute on function public.wallet_pay_fees(uuid) to authenticated;
