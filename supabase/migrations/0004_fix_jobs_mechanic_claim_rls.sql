-- Permite mecânico reivindicar job aberto (open → assigned com seu mechanic_id)
drop policy if exists jobs_mechanic_claim on public.jobs;
create policy jobs_mechanic_claim on public.jobs for update
  using  (status = 'open')
  with check (
    mechanic_id in (select id from public.mechanics where profile_id = auth.uid())
    and status = 'assigned'
  );
