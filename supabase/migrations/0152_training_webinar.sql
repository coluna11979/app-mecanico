-- Webinar gravado: a gravação de um treinamento vira uma página pública
-- (/webinar/:slug) pro anúncio. A pessoa deixa nome e WhatsApp, assiste e
-- o botão embaixo leva pro cadastro de oficina ou de mecânico.

alter type lead_origem add value if not exists 'webinar';

alter table training_sessions
  add column if not exists webinar_slug text unique,
  add column if not exists webinar_intent text check (webinar_intent in ('mechanic', 'workshop')),
  add column if not exists webinar_published boolean not null default false;

-- Leitura pública só do que a página precisa, e só se estiver publicado
create or replace function get_webinar(p_slug text)
returns table (title text, description text, intent text, segments text[])
language sql stable security definer set search_path = public as $$
  select s.title, s.description, s.webinar_intent, s.recording_segments
  from training_sessions s
  where s.webinar_slug = lower(p_slug)
    and s.webinar_published
    and cardinality(s.recording_segments) > 0;
$$;

-- Lead do webinar: mesmo WhatsApp não duplica, só ganha a etiqueta do webinar
create or replace function webinar_lead(
  p_slug text, p_name text, p_phone text,
  p_utm_source text default null, p_utm_medium text default null,
  p_utm_campaign text default null, p_campaign_id uuid default null,
  p_user_agent text default null, p_referrer text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_intent text;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_tag text := 'webinar:' || lower(p_slug);
  v_id uuid;
begin
  select webinar_intent into v_intent from training_sessions
  where webinar_slug = lower(p_slug) and webinar_published;
  if v_intent is null then return false; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(v_phone) < 10 then return false; end if;

  select id into v_id from leads where phone = v_phone and intent = v_intent
  order by created_at desc limit 1;

  if v_id is not null then
    update leads set tags = array(select distinct unnest(tags || array['webinar', v_tag])),
      updated_at = now()
    where id = v_id;
  else
    insert into leads (name, email, phone, intent, consent, origem, tags,
      utm_source, utm_medium, utm_campaign, campaign_id, user_agent, referrer)
    values (left(trim(p_name), 120), '', v_phone, v_intent, true, 'webinar', array['webinar', v_tag],
      left(p_utm_source, 80), left(p_utm_medium, 80), left(p_utm_campaign, 120), p_campaign_id,
      left(p_user_agent, 240), left(p_referrer, 240));
  end if;
  return true;
end;
$$;

grant execute on function get_webinar(text) to anon, authenticated;
grant execute on function webinar_lead(text, text, text, text, text, text, uuid, text, text) to anon, authenticated;
