-- Hora em que o mecânico aceitou a demanda.
-- Usada no prazo de chegada: passou do prazo sem chegar, a oficina cancela sem multa
-- (regra em src/lib/arrivalDeadline.ts e na Edge Function cancel-job).

alter table public.jobs add column if not exists accepted_at timestamptz;

create or replace function public.set_job_accepted_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.mechanic_id is null then
    new.accepted_at := null;                       -- mecânico desistiu / demanda reaberta
  elsif tg_op = 'INSERT' or old.mechanic_id is distinct from new.mechanic_id then
    new.accepted_at := now();                      -- novo aceite (ou contratação direta)
  end if;
  return new;
end;
$$;

drop trigger if exists trg_jobs_accepted_at on public.jobs;
create trigger trg_jobs_accepted_at
  before insert or update of mechanic_id on public.jobs
  for each row execute function public.set_job_accepted_at();

-- Demandas ativas já aceitas: usa created_at (mesmo comportamento de antes)
update public.jobs
   set accepted_at = created_at
 where mechanic_id is not null
   and accepted_at is null
   and status in ('assigned', 'in_progress');
