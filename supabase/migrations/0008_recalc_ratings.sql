-- Recalcula agregados de rating e total_jobs em mechanics/workshops
-- Bug: campos eram "fantasmas" — nunca atualizados quando uma avaliação chegava
-- nem quando um job era concluído.

create or replace function public.recalc_mechanic_stats(p_mechanic_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.mechanics m
  set total_jobs = stats.completed_count,
      rating     = coalesce(stats.avg_rating, 0)
  from (
    select
      count(*) filter (where status = 'completed')                                       as completed_count,
      avg(mechanic_rating) filter (where status = 'completed' and mechanic_rating > 0) as avg_rating
    from public.jobs
    where mechanic_id = p_mechanic_id
  ) as stats
  where m.id = p_mechanic_id;
$$;

create or replace function public.recalc_workshop_stats(p_workshop_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.workshops w
  set total_jobs = stats.completed_count,
      rating     = coalesce(stats.avg_rating, 0)
  from (
    select
      count(*) filter (where status = 'completed')                                       as completed_count,
      avg(workshop_rating) filter (where status = 'completed' and workshop_rating > 0) as avg_rating
    from public.jobs
    where workshop_id = p_workshop_id
  ) as stats
  where w.id = p_workshop_id;
$$;

-- Trigger: dispara quando status vira 'completed' OU quando alguma avaliação
-- é registrada/alterada. Recalcula stats das duas pontas.
create or replace function public.trg_recalc_job_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- IS DISTINCT FROM já lida com NULL (NULL é distinto de qualquer valor não-nulo).
  -- Não usar coalesce(old.status, '') pq status é enum job_status e '' quebra.
  if new.mechanic_id is not null then
    if tg_op = 'INSERT'
       or old.status is distinct from new.status
       or old.mechanic_rating is distinct from new.mechanic_rating
    then
      perform public.recalc_mechanic_stats(new.mechanic_id);
    end if;
  end if;

  if new.workshop_id is not null then
    if tg_op = 'INSERT'
       or old.status is distinct from new.status
       or old.workshop_rating is distinct from new.workshop_rating
    then
      perform public.recalc_workshop_stats(new.workshop_id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_recalc_stats on public.jobs;
create trigger jobs_recalc_stats
  after insert or update of status, mechanic_rating, workshop_rating
  on public.jobs
  for each row
  execute function public.trg_recalc_job_stats();

-- Backfill: corrige todos os agregados existentes
do $$
declare m_id uuid;
begin
  for m_id in select id from public.mechanics loop
    perform public.recalc_mechanic_stats(m_id);
  end loop;
end $$;

do $$
declare w_id uuid;
begin
  for w_id in select id from public.workshops loop
    perform public.recalc_workshop_stats(w_id);
  end loop;
end $$;
