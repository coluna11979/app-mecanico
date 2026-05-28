-- Permite cancelar (recolher) um aviso broadcast já enviado.
-- Adiciona broadcast_id ligando todas as linhas de um mesmo envio,
-- faz backfill dos envios antigos e cria RPC de cancelamento.

alter table public.notifications add column if not exists broadcast_id uuid;

create index if not exists notifications_broadcast_idx on public.notifications(broadcast_id)
  where broadcast_id is not null;

-- Backfill: agrupa broadcasts existentes por título+body+minuto e gera um
-- uuid determinístico igual pra cada grupo.
update public.notifications
set broadcast_id = md5(coalesce(title,'') || '|' || coalesce(body,'') || '|' || date_trunc('minute', created_at)::text)::uuid
where type = 'broadcast' and broadcast_id is null;

-- broadcast_notification agora estampa um broadcast_id único por envio
create or replace function public.broadcast_notification(
  p_title  text,
  p_body   text,
  p_icon   text,
  p_link   text,
  p_target text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
  bid uuid := gen_random_uuid();
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;
  if p_target not in ('all', 'mechanic', 'workshop') then
    raise exception 'invalid target';
  end if;

  insert into public.notifications (user_id, title, body, type, icon, link, read, broadcast_id)
  select p.id, p_title, p_body, 'broadcast', p_icon, p_link, false, bid
  from public.profiles p
  where p.status::text = 'approved'
    and (p_target = 'all' or p.role::text = p_target);

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- Cancela (apaga) todas as cópias de um aviso. Admin only.
create or replace function public.cancel_broadcast(p_broadcast_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;
  delete from public.notifications
  where broadcast_id = p_broadcast_id and type = 'broadcast';
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.cancel_broadcast(uuid) from public;
grant execute on function public.cancel_broadcast(uuid) to authenticated;
