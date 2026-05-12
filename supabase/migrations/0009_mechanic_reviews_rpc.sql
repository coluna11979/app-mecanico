-- RPC: retorna avaliações de um mecânico para qualquer usuário autenticado
-- Contorna RLS (workshop A não enxerga jobs do workshop B), mas só expõe
-- campos não-sensíveis: nota, comentário, data e nome da oficina avaliadora.

create or replace function public.get_mechanic_reviews(p_mechanic_id uuid)
returns table (
  rating       int,
  note         text,
  rated_at     timestamptz,
  workshop_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    j.mechanic_rating::int                                              as rating,
    j.mechanic_rating_note                                              as note,
    coalesce(j.workshop_confirmed_at, j.completed_at, j.created_at)     as rated_at,
    w.business_name                                                     as workshop_name
  from public.jobs j
  join public.workshops w on w.id = j.workshop_id
  where j.mechanic_id = p_mechanic_id
    and j.status = 'completed'
    and j.mechanic_rating is not null
    and j.mechanic_rating > 0
  order by coalesce(j.workshop_confirmed_at, j.completed_at, j.created_at) desc
  limit 50;
$$;

revoke all on function public.get_mechanic_reviews(uuid) from public;
grant execute on function public.get_mechanic_reviews(uuid) to authenticated;
