-- Trocar mecânico nos 5 min após o aceite + confirmação antecipada da oficina.
-- Só acrescenta: duas colunas, um gatilho que barra o recusado e a função da troca.

alter table public.jobs
  add column if not exists rejected_mechanic_ids uuid[] not null default '{}',
  add column if not exists workshop_approved_at timestamptz;

comment on column public.jobs.rejected_mechanic_ids is 'Mecânicos que a oficina trocou nesta demanda (não podem aceitar de novo)';
comment on column public.jobs.workshop_approved_at is 'Oficina confirmou o mecânico antes dos 5 min de tolerância (ele pode sair)';

-- Mecânico trocado não pega a mesma demanda de novo
create or replace function public.block_rejected_mechanic()
returns trigger language plpgsql as $$
begin
  if new.mechanic_id is not null
     and new.mechanic_id is distinct from old.mechanic_id
     and new.mechanic_id = any(coalesce(old.rejected_mechanic_ids, '{}')) then
    raise exception 'Esta demanda não está mais disponível para você';
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_block_rejected_mechanic on public.jobs;
create trigger jobs_block_rejected_mechanic
  before update of mechanic_id on public.jobs
  for each row execute function public.block_rejected_mechanic();

-- A oficina troca o mecânico: a demanda volta a ficar aberta para os outros (sem multa, sem nota)
create or replace function public.workshop_swap_mechanic(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  j public.jobs%rowtype;
  v_mech_profile uuid;
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
  if j.accepted_at is null or now() - j.accepted_at > interval '5 minutes' then
    return jsonb_build_object('error', 'Passaram os 5 minutos para trocar o mecânico');
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
