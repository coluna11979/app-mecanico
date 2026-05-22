-- Sistema de avisos in-app (admin → usuário).
-- Reaproveita a tabela notifications já existente (estava vazia e sem uso),
-- adicionando icon/link e default em type.

alter table public.notifications add column if not exists icon text;
alter table public.notifications add column if not exists link text;
alter table public.notifications alter column type set default 'info';
alter table public.notifications alter column read set default false;

create index if not exists notifications_user_idx        on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id) where read = false;

-- Admin pode inserir avisos individuais (broadcast vai pela RPC security definer)
drop policy if exists notifications_admin_insert on public.notifications;
create policy notifications_admin_insert on public.notifications
  for insert with check (public.is_admin(auth.uid()));

-- RPC de broadcast: insere uma linha por usuário do segmento.
-- target: 'all' | 'mechanic' | 'workshop'
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
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;
  if p_target not in ('all', 'mechanic', 'workshop') then
    raise exception 'invalid target';
  end if;

  insert into public.notifications (user_id, title, body, type, icon, link, read)
  select p.id, p_title, p_body, 'broadcast', p_icon, p_link, false
  from public.profiles p
  where p.status = 'approved'
    and (p_target = 'all' or p.role = p_target);

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.broadcast_notification(text, text, text, text, text) from public;
grant execute on function public.broadcast_notification(text, text, text, text, text) to authenticated;
