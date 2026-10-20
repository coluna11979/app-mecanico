-- Convite direto exige o aceite do mecânico.
--
-- Antes: "Contratar" (Buscar profissionais) e o modo "Chamar um mecânico específico"
-- do painel de Demandas criavam o job já como status='assigned' com mechanic_id
-- preenchido — a demanda nascia aceita e caía direto na Agenda do mecânico.
--
-- Agora o convite nasce como demanda ABERTA endereçada a um mecânico:
--   status = 'open', audience = 'invite', invited_mechanic_id = <mecânico>, mechanic_id = null
-- Só esse mecânico vê e pode aceitar (mesmo caminho do aceite de demanda aberta:
-- open → assigned com o próprio mechanic_id). O trigger trg_jobs_accepted_at grava
-- accepted_at no aceite, então o prazo de chegada conta a partir dele.
-- Enquanto não aceita, mechanic_id é null → cancel-job trata como 'open_unaccepted' (sem multa).
-- Recusa: RPC decline_job_invite → cancelada sem multa e a oficina é avisada.

alter table public.jobs
  add column if not exists invited_mechanic_id uuid references public.mechanics(id) on delete set null;

create index if not exists jobs_invited_mechanic_idx on public.jobs(invited_mechanic_id)
  where invited_mechanic_id is not null;

comment on column public.jobs.invited_mechanic_id is
  'Convite direto: mecânico convidado (audience = invite). Vira mechanic_id só quando ele aceita.';

alter table public.jobs drop constraint if exists jobs_audience_check;
alter table public.jobs add constraint jobs_audience_check
  check (audience in ('public', 'favorites', 'invite'));

alter table public.jobs drop constraint if exists jobs_invite_target_check;
alter table public.jobs add constraint jobs_invite_target_check
  check (audience <> 'invite' or invited_mechanic_id is not null) not valid;

-- ── Leitura: convite aberto só aparece para o mecânico convidado ──
drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs
  for select
  using (
    public.is_admin(auth.uid())
    or (status = 'open'::job_status and (
      audience = 'public'
      or (audience = 'favorites' and exists (
        select 1
        from public.workshop_favorite_mechanics f
        join public.mechanics m on m.id = f.mechanic_id
        where f.workshop_id = jobs.workshop_id
          and m.profile_id = auth.uid()
      ))
      or (audience = 'invite' and invited_mechanic_id in (
        select id from public.mechanics where profile_id = auth.uid()
      ))
    ))
    or public.is_workshop_member(workshop_id, auth.uid())
    or mechanic_id in (
      select id from public.mechanics where profile_id = auth.uid()
    )
    -- Convite recusado/cancelado continua visível para quem foi convidado (histórico)
    or invited_mechanic_id in (
      select id from public.mechanics where profile_id = auth.uid()
    )
  );

-- ── Aceite: convite só pode ser aceito pelo mecânico convidado ──
drop policy if exists jobs_mechanic_claim on public.jobs;
create policy jobs_mechanic_claim on public.jobs for update
  using (
    status = 'open'
    and (
      audience <> 'invite'
      or invited_mechanic_id in (select id from public.mechanics where profile_id = auth.uid())
    )
  )
  with check (
    mechanic_id in (select id from public.mechanics where profile_id = auth.uid())
    and status = 'assigned'
  );

-- ── Recusa do convite ──
create or replace function public.decline_job_invite(p_job_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job    public.jobs%rowtype;
  v_mech   uuid;
  v_name   text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select id into v_mech from public.mechanics where profile_id = auth.uid();
  if v_mech is null then
    raise exception 'not a mechanic';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.audience <> 'invite' or v_job.invited_mechanic_id is distinct from v_mech then
    raise exception 'convite não encontrado';
  end if;
  if v_job.status <> 'open' then
    raise exception 'esse convite não está mais pendente';
  end if;

  update public.jobs set
    status              = 'cancelled',
    cancelled_at        = now(),
    cancelled_by        = 'mechanic',
    cancellation_reason = 'Convite recusado pelo mecânico' || coalesce(': ' || left(v_reason, 300), ''),
    cancellation_fee    = 0,
    cancellation_refund = 0
  where id = p_job_id;

  select p.full_name into v_name
    from public.mechanics m join public.profiles p on p.id = m.profile_id
   where m.id = v_mech;

  insert into public.notifications (user_id, title, body, type, link)
  select w.profile_id,
         'Convite recusado',
         coalesce(v_name, 'O mecânico') || ' recusou "' || v_job.title || '"'
           || coalesce(' (' || left(v_reason, 120) || ')', '')
           || '. Escolha outro mecânico ou publique para todos.',
         'warning',
         '/oficina/buscar'
    from public.workshops w
   where w.id = v_job.workshop_id and w.profile_id is not null;
end;
$$;

revoke all on function public.decline_job_invite(uuid, text) from public, anon;
grant execute on function public.decline_job_invite(uuid, text) to authenticated;

-- ── Aviso no app (Avisos) para o mecânico convidado ──
create or replace function public.notify_job_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.audience = 'invite' and new.status = 'open' and new.invited_mechanic_id is not null then
    begin
      insert into public.notifications (user_id, title, body, type, link)
      select m.profile_id,
             'Você recebeu um convite',
             coalesce(w.business_name, 'Uma oficina') || ' quer contratar você: "' || new.title || '". Aceite ou recuse.',
             'info',
             '/mecanico/job/' || new.id
        from public.mechanics m
        left join public.workshops w on w.id = new.workshop_id
       where m.id = new.invited_mechanic_id;
    exception when others then
      raise warning 'notify_job_invite falhou: %', sqlerrm;  -- aviso nunca impede o convite
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.notify_job_invite() from public, anon, authenticated;

drop trigger if exists jobs_notify_invite on public.jobs;
create trigger jobs_notify_invite
  after insert on public.jobs
  for each row execute function public.notify_job_invite();

-- ── Push: convite vai só para o convidado (kind = 'invite') ──
create or replace function public.notify_new_job_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  -- Demanda aberta nova (pública, preferidos ou convite) ou que voltou a ficar aberta
  if not (
       (tg_op = 'INSERT' and new.status = 'open')
    or (tg_op = 'UPDATE' and new.status = 'open' and old.status is distinct from 'open')
  ) then
    return new;
  end if;

  begin
    select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_notify_url'    limit 1;
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_notify_secret' limit 1;
    if v_url is null or v_secret is null then
      return new;
    end if;

    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body    := jsonb_build_object('job_id', new.id, 'kind', case when new.audience = 'invite' then 'invite' else 'open' end)
    );
  exception when others then
    -- Push é "melhor esforço": nunca impede criar/reabrir a demanda
    raise warning 'notify_new_job_push falhou: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.notify_new_job_push() from public, anon, authenticated;
