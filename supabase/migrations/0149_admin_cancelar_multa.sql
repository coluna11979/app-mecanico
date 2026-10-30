-- Admin pode cancelar (perdoar) multa de cancelamento de uma oficina.
-- Multa cancelada deixa de contar como pendente e a oficina volta a publicar demandas.

alter table public.jobs
  add column if not exists cancellation_fee_waived_at     timestamptz,
  add column if not exists cancellation_fee_waived_by     uuid references public.profiles(id) on delete set null,
  add column if not exists cancellation_fee_waived_reason text;

create or replace function public.workshop_pending_fees(target_workshop_id uuid)
returns table(total numeric, count_jobs integer, job_ids uuid[])
language sql security definer set search_path to 'public' as $$
  select
    coalesce(sum(cancellation_fee), 0)::numeric as total,
    count(*)::integer as count_jobs,
    coalesce(array_agg(id order by cancelled_at desc), array[]::uuid[]) as job_ids
  from jobs
  where workshop_id = target_workshop_id
    and cancellation_fee is not null
    and cancellation_fee > 0
    and cancellation_fee_paid_at is null
    and cancellation_fee_waived_at is null;
$$;

-- Lista multas (em aberto, pagas e canceladas) para o painel admin
create or replace function public.admin_cancellation_fees()
returns table (
  job_id uuid, title text, workshop_id uuid, workshop_name text,
  fee numeric, cancelled_at timestamptz, cancelled_by text, cancellation_reason text,
  paid_at timestamptz, waived_at timestamptz, waived_reason text
)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin'::user_role) then
    raise exception 'Acesso restrito a admin';
  end if;
  return query
    select j.id, j.title, j.workshop_id, w.business_name,
           j.cancellation_fee, j.cancelled_at, j.cancelled_by, j.cancellation_reason,
           j.cancellation_fee_paid_at, j.cancellation_fee_waived_at, j.cancellation_fee_waived_reason
      from jobs j
      left join workshops w on w.id = j.workshop_id
     where coalesce(j.cancellation_fee, 0) > 0
     order by (j.cancellation_fee_paid_at is null and j.cancellation_fee_waived_at is null) desc,
              j.cancelled_at desc nulls last
     limit 200;
end;
$$;
revoke all on function public.admin_cancellation_fees() from public;
grant execute on function public.admin_cancellation_fees() to authenticated;

create or replace function public.admin_waive_cancellation_fee(p_job_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_fee numeric;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin'::user_role) then
    raise exception 'Acesso restrito a admin';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Informe o motivo';
  end if;

  update jobs
     set cancellation_fee_waived_at     = now(),
         cancellation_fee_waived_by     = auth.uid(),
         cancellation_fee_waived_reason = btrim(p_reason)
   where id = p_job_id
     and coalesce(cancellation_fee, 0) > 0
     and cancellation_fee_paid_at is null
     and cancellation_fee_waived_at is null
  returning cancellation_fee into v_fee;

  if v_fee is null then
    raise exception 'Multa não encontrada, já paga ou já cancelada';
  end if;

  insert into messages (job_id, sender_id, content)
  values (p_job_id, auth.uid(),
          format('✅ A multa de cancelamento de R$ %s foi cancelada pela equipe MecânicoApp.', to_char(v_fee, 'FM999990D00')));
end;
$$;
revoke all on function public.admin_waive_cancellation_fee(uuid, text) from public;
grant execute on function public.admin_waive_cancellation_fee(uuid, text) to authenticated;
