-- Trocar mecânico na demanda AGENDADA: até 2h antes do horário marcado (mesmo prazo de cancelar sem multa).
-- Agendada = horário marcado mais de 1h depois do aceite. Imediata continua com 5 min.
-- Só muda a checagem de prazo da função de 0154; o resto é igual. Espelha freeCancelUntil (src/lib/arrivalDeadline.ts)
-- e freeCancelUntilMs (cancel-job): mude nos três lugares.

create or replace function public.workshop_swap_mechanic(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  j public.jobs%rowtype;
  v_mech_profile uuid;
  v_until timestamptz;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found then return jsonb_build_object('error', 'Demanda não encontrada'); end if;
  if not public.is_workshop_member(j.workshop_id, auth.uid()) then
    return jsonb_build_object('error', 'Sem permissão');
  end if;
  if j.status <> 'assigned' or j.mechanic_id is null or j.arrived_at is not null or j.pix_paid_at is not null then
    return jsonb_build_object('error', 'Não dá mais para trocar o mecânico desta demanda');
  end if;
  if j.audience = 'invite' then
    return jsonb_build_object('error', 'Convite direto: cancele e convide outro mecânico');
  end if;
  if j.workshop_approved_at is not null then
    return jsonb_build_object('error', 'Você já confirmou este mecânico');
  end if;
  if j.accepted_at is null then
    return jsonb_build_object('error', 'Não dá mais para trocar o mecânico desta demanda');
  end if;

  v_until := j.accepted_at + interval '5 minutes';
  if j.scheduled_at is not null and j.scheduled_at - j.accepted_at > interval '1 hour' then
    v_until := greatest(j.scheduled_at - interval '2 hours', v_until);
  end if;
  if now() > v_until then
    return jsonb_build_object('error', case when v_until > j.accepted_at + interval '5 minutes'
      then 'Passou o prazo para trocar (2h antes do horário marcado)'
      else 'Passaram os 5 minutos para trocar o mecânico' end);
  end if;

  select profile_id into v_mech_profile from public.mechanics where id = j.mechanic_id;

  update public.jobs set
    rejected_mechanic_ids = array_append(coalesce(rejected_mechanic_ids, '{}'), j.mechanic_id),
    mechanic_id = null,          -- o gatilho limpa o accepted_at
    status = 'open',             -- o gatilho do push avisa os mecânicos de novo
    en_route_at = null,
    arrived_at = null
  where id = p_job_id;

  if v_mech_profile is not null then
    begin
      insert into public.notifications (user_id, type, link, title, body)
      values (v_mech_profile, 'info', '/mecanico/dashboard',
        'A oficina escolheu outro profissional',
        format('"%s" foi liberada para outro mecânico. Isso não afeta a sua nota.', j.title));
    exception when others then null;  -- aviso é melhor esforço
    end;
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.workshop_swap_mechanic(uuid) from public, anon;
grant execute on function public.workshop_swap_mechanic(uuid) to authenticated;
