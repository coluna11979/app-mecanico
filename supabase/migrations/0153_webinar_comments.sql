-- Comentários do webinar gravado, estilo YouTube: a pessoa comenta embaixo do vídeo,
-- o admin aprova e responde, e só os aprovados aparecem pra quem assistir depois.

create table if not exists webinar_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references training_sessions(id) on delete cascade,
  name text not null,
  phone text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists webinar_comments_session_idx on webinar_comments (session_id, created_at desc);

alter table webinar_comments enable row level security;
create policy webinar_comments_admin on webinar_comments for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Público: só os aprovados, sem o telefone
create or replace function get_webinar_comments(p_slug text)
returns table (id uuid, name text, body text, reply text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.body, c.reply, c.created_at
  from webinar_comments c
  join training_sessions s on s.id = c.session_id
  where s.webinar_slug = lower(p_slug) and s.webinar_published and c.status = 'approved'
  order by c.created_at desc
  limit 200;
$$;

create or replace function webinar_comment(p_slug text, p_name text, p_phone text, p_body text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_session uuid;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_body text := trim(coalesce(p_body, ''));
begin
  select id into v_session from training_sessions
  where webinar_slug = lower(p_slug) and webinar_published;
  if v_session is null then return false; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(v_phone) < 10 then return false; end if;
  if length(v_body) < 2 then return false; end if;
  -- Freio contra enxurrada: no máximo 5 comentários por WhatsApp por hora
  if (select count(*) from webinar_comments
      where phone = v_phone and created_at > now() - interval '1 hour') >= 5 then
    return false;
  end if;
  insert into webinar_comments (session_id, name, phone, body)
  values (v_session, left(trim(p_name), 80), v_phone, left(v_body, 1000));
  return true;
end;
$$;

grant execute on function get_webinar_comments(text) to anon, authenticated;
grant execute on function webinar_comment(text, text, text, text) to anon, authenticated;
