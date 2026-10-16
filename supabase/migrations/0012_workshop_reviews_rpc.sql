-- RPC: retorna avaliações de uma oficina para qualquer usuário autenticado.
-- Espelha get_mechanic_reviews — mecânico precisa ver o que outros mecânicos
-- falaram da oficina antes de aceitar o job.

create or replace function public.get_workshop_reviews(p_workshop_id uuid)
returns table (
  rating         int,
  note           text,
  rated_at       timestamptz,
  mechanic_name  text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    j.workshop_rating::int                                              as rating,
    j.workshop_rating_note                                              as note,
    coalesce(j.workshop_confirmed_at, j.completed_at, j.created_at)     as rated_at,
    p.full_name                                                         as mechanic_name
  from public.jobs j
  join public.mechanics m on m.id = j.mechanic_id
  join public.profiles p  on p.id = m.profile_id
  where j.workshop_id = p_workshop_id
    and j.status = 'completed'
    and j.workshop_rating is not null
    and j.workshop_rating > 0
  order by coalesce(j.workshop_confirmed_at, j.completed_at, j.created_at) desc
  limit 50;
$$;

revoke all on function public.get_workshop_reviews(uuid) from public;
grant execute on function public.get_workshop_reviews(uuid) to authenticated;
