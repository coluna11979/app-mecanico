-- Check-up pelo celular do mecânico, por link.
-- A oficina envia (WhatsApp) um link exclusivo do check-up para o mecânico da
-- equipe. Ele abre no celular sem login, preenche o checklist, tira as fotos e
-- finaliza. Regras:
--   • o link dá acesso só àquele check-up e vale 7 dias (reenviar renova);
--   • depois de finalizado, o link é só leitura;
--   • se o mecânico tem PIN (Acessos e funções), o PIN é pedido na primeira vez
--     em cada celular; o aparelho fica lembrado (checkup_mechanic_devices).
-- Tudo passa pelas funções abaixo (security definer), que validam o token.

alter table public.vehicle_checkups
  add column if not exists mechanic_token            text unique,
  add column if not exists mechanic_upload_key       text,
  add column if not exists mechanic_token_expires_at timestamptz,
  add column if not exists mechanic_link_sent_at     timestamptz,
  add column if not exists mechanic_opened_at        timestamptz,
  add column if not exists mechanic_started_at       timestamptz,
  add column if not exists mechanic_finished_at      timestamptz;

-- Celulares já liberados com o PIN do mecânico (guarda só o hash do token)
create table if not exists public.checkup_mechanic_devices (
  id                   uuid primary key default gen_random_uuid(),
  workshop_mechanic_id uuid not null references public.workshop_mechanics(id) on delete cascade,
  token_hash           text not null unique,
  created_at           timestamptz not null default now(),
  last_used_at         timestamptz not null default now()
);
alter table public.checkup_mechanic_devices enable row level security; -- sem policies: só as funções acessam

-- ── Oficina: gera/renova o link do mecânico ─────────────────────────────────
create or replace function public.checkup_send_to_mechanic(p_checkup uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c   vehicle_checkups;
  m   workshop_mechanics;
  pin boolean;
begin
  select * into c from vehicle_checkups where id = p_checkup for update;
  if c.id is null or not is_workshop_member(c.workshop_id, auth.uid()) then
    raise exception 'Sem permissão';
  end if;
  if c.status <> 'draft' then raise exception 'Check-up já finalizado'; end if;
  if c.workshop_mechanic_id is null then raise exception 'Escolha o mecânico primeiro'; end if;

  select * into m from workshop_mechanics where id = c.workshop_mechanic_id;
  pin := exists (select 1 from workshop_operators o
                  where o.mechanic_id = m.id and o.active and o.has_pin);

  -- Link ainda válido: mantém (a mensagem antiga continua funcionando) e renova o prazo
  if c.mechanic_token is null or c.mechanic_token_expires_at < now() then
    c.mechanic_token      := encode(gen_random_bytes(18), 'hex');
    c.mechanic_upload_key := encode(gen_random_bytes(12), 'hex');
    c.mechanic_opened_at  := null;
  end if;

  update vehicle_checkups
     set mechanic_token            = c.mechanic_token,
         mechanic_upload_key       = c.mechanic_upload_key,
         mechanic_opened_at        = c.mechanic_opened_at,
         mechanic_token_expires_at = now() + interval '7 days',
         mechanic_link_sent_at     = now(),
         updated_at                = now()
   where id = c.id;

  return json_build_object('token', c.mechanic_token, 'mechanic_name', m.name,
                           'mechanic_phone', m.phone, 'has_pin', pin);
end;
$$;

-- ── Uso interno: valida token + aparelho e devolve o check-up ───────────────
-- p_write = true exige check-up em rascunho e link dentro do prazo.
create or replace function public._mech_checkup(p_token text, p_device text, p_write boolean)
returns vehicle_checkups
language plpgsql
security definer
set search_path = public, extensions
as $$
declare c vehicle_checkups;
begin
  select * into c from vehicle_checkups where mechanic_token = p_token and p_token is not null;
  if c.id is null then raise exception 'Link inválido. Peça um novo para a oficina.'; end if;
  if p_write and c.status <> 'draft' then raise exception 'Check-up já finalizado'; end if;
  if c.status = 'draft' and c.mechanic_token_expires_at < now() then
    raise exception 'Link vencido. Peça um novo para a oficina.';
  end if;
  if exists (select 1 from workshop_operators o
              where o.mechanic_id = c.workshop_mechanic_id and o.active and o.has_pin)
     and not exists (select 1 from checkup_mechanic_devices d
                      where d.workshop_mechanic_id = c.workshop_mechanic_id
                        and d.token_hash = encode(digest(coalesce(p_device, ''), 'sha256'), 'hex')) then
    raise exception 'PIN necessário';
  end if;
  return c;
end;
$$;

-- ── Mecânico: abrir o link ──────────────────────────────────────────────────
create or replace function public.mech_checkup_open(p_token text, p_device text default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c   vehicle_checkups;
  mn  text;
  wn  text;
  car json;
begin
  select * into c from vehicle_checkups where mechanic_token = p_token and p_token is not null;
  if c.id is null then return json_build_object('ok', false, 'error', 'Link inválido. Peça um novo para a oficina.'); end if;

  select name into mn from workshop_mechanics where id = c.workshop_mechanic_id;
  select business_name into wn from workshops where id = c.workshop_id;
  car := json_build_object('plate', c.plate, 'make', c.make, 'model', c.model, 'year', c.year,
                           'km_reading', c.km_reading, 'mechanic_name', mn, 'workshop_name', wn);

  if c.status = 'draft' and c.mechanic_token_expires_at < now() then
    return json_build_object('ok', false, 'error', 'Link vencido. Peça um novo para a oficina.', 'car', car);
  end if;

  begin
    perform _mech_checkup(p_token, p_device, false);
  exception when others then
    if sqlerrm = 'PIN necessário' then
      return json_build_object('ok', true, 'need_pin', true, 'car', car);
    end if;
    raise;
  end;

  update checkup_mechanic_devices set last_used_at = now()
   where token_hash = encode(digest(coalesce(p_device, ''), 'sha256'), 'hex');
  if c.mechanic_opened_at is null then
    update vehicle_checkups set mechanic_opened_at = now() where id = c.id;
  end if;

  return json_build_object(
    'ok', true, 'need_pin', false, 'car', car,
    'checkup', json_build_object(
      'id', c.id, 'workshop_id', c.workshop_id, 'status', c.status, 'score', c.score,
      'notes', c.notes, 'upload_key', case when c.status = 'draft' then c.mechanic_upload_key end,
      'customer_first_name', nullif(split_part(coalesce(c.customer_name, ''), ' ', 1), '')),
    'items', coalesce((
      select json_agg(json_build_object(
        'id', i.id, 'checkup_id', i.checkup_id, 'system', i.system, 'item_key', i.item_key,
        'label', i.label, 'position', i.position, 'status', i.status,
        'measurement', i.measurement, 'note', i.note, 'photo_path', i.photo_path
      ) order by i.position)
      from checkup_items i where i.checkup_id = c.id), '[]'::json));
end;
$$;

-- ── Mecânico: PIN na primeira vez neste celular ─────────────────────────────
-- Mesmo PIN e mesmo bloqueio (5 erros = 5 min) do modo balcão.
create or replace function public.mech_checkup_pin(p_token text, p_pin text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c    vehicle_checkups;
  _op  workshop_operators;
  _sec workshop_operator_secrets;
  dev  text;
begin
  select * into c from vehicle_checkups where mechanic_token = p_token and p_token is not null;
  if c.id is null then return json_build_object('ok', false, 'error', 'Link inválido'); end if;

  select * into _op from workshop_operators
   where mechanic_id = c.workshop_mechanic_id and active and has_pin limit 1;
  if _op.id is null then return json_build_object('ok', true, 'device', null); end if;

  select * into _sec from workshop_operator_secrets where operator_id = _op.id;
  if _sec.locked_until is not null and _sec.locked_until > now() then
    return json_build_object('ok', false, 'error',
      'Muitas tentativas erradas. Tente de novo em ' || ceil(extract(epoch from _sec.locked_until - now()) / 60)::int || ' min.');
  end if;

  if _sec.pin_hash is null or _sec.pin_hash <> crypt(coalesce(p_pin, ''), _sec.pin_hash) then
    update workshop_operator_secrets
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '5 minutes' else null end
     where operator_id = _op.id;
    return json_build_object('ok', false, 'error',
      case when _sec.failed_attempts + 1 >= 5 then 'PIN incorreto. Bloqueado por 5 minutos.' else 'PIN incorreto' end);
  end if;

  update workshop_operator_secrets set failed_attempts = 0, locked_until = null where operator_id = _op.id;
  dev := encode(gen_random_bytes(24), 'hex');
  insert into checkup_mechanic_devices (workshop_mechanic_id, token_hash)
  values (c.workshop_mechanic_id, encode(digest(dev, 'sha256'), 'hex'));
  return json_build_object('ok', true, 'device', dev);
end;
$$;

-- ── Mecânico: avaliar itens (um ou vários de uma vez) ───────────────────────
-- p_patch aceita só: status, measurement, note, photo_path
create or replace function public.mech_checkup_update_items(p_token text, p_device text, p_items uuid[], p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c vehicle_checkups;
  st text := p_patch->>'status';
  ph text := p_patch->>'photo_path';
begin
  c := _mech_checkup(p_token, p_device, true);
  if p_patch ? 'status' and st is not null and st not in ('ok', 'warn', 'urgent', 'na') then
    raise exception 'Status inválido';
  end if;
  if p_patch ? 'photo_path' and ph is not null
     and ph not like c.workshop_id::text || '/' || c.id::text || '/%' then
    raise exception 'Foto inválida';
  end if;

  update checkup_items i set
    status      = case when p_patch ? 'status'      then st else i.status end,
    measurement = case when p_patch ? 'measurement' then left(p_patch->>'measurement', 40) else i.measurement end,
    note        = case when p_patch ? 'note'        then left(p_patch->>'note', 500) else i.note end,
    photo_path  = case when p_patch ? 'photo_path'  then ph else i.photo_path end,
    updated_at  = now()
  where i.checkup_id = c.id and i.id = any(p_items);

  update vehicle_checkups
     set mechanic_started_at = coalesce(mechanic_started_at, now()), updated_at = now()
   where id = c.id;
end;
$$;

-- ── Mecânico: incluir / remover item fora do checklist ──────────────────────
create or replace function public.mech_checkup_add_item(p_token text, p_device text, p_system text, p_label text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c vehicle_checkups;
  r checkup_items;
begin
  c := _mech_checkup(p_token, p_device, true);
  if coalesce(trim(p_label), '') = '' then raise exception 'Informe o item'; end if;
  insert into checkup_items (checkup_id, system, item_key, label, position)
  values (c.id, left(p_system, 60), 'extra_' || encode(gen_random_bytes(5), 'hex'), left(trim(p_label), 80),
          coalesce((select max(position) from checkup_items where checkup_id = c.id), 0) + 1)
  returning * into r;
  return json_build_object('id', r.id, 'checkup_id', r.checkup_id, 'system', r.system, 'item_key', r.item_key,
                           'label', r.label, 'position', r.position, 'status', r.status,
                           'measurement', r.measurement, 'note', r.note, 'photo_path', r.photo_path);
end;
$$;

create or replace function public.mech_checkup_remove_item(p_token text, p_device text, p_item uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare c vehicle_checkups;
begin
  c := _mech_checkup(p_token, p_device, true);
  delete from checkup_items where id = p_item and checkup_id = c.id and item_key like 'extra\_%';
end;
$$;

-- ── Mecânico: finalizar (nota calculada aqui, mesma regra do app) ───────────
create or replace function public.mech_checkup_finish(p_token text, p_device text, p_notes text)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c vehicle_checkups;
  w int; u int; s int;
begin
  c := _mech_checkup(p_token, p_device, true);
  if not exists (select 1 from checkup_items where checkup_id = c.id and status is not null) then
    raise exception 'Avalie ao menos um item';
  end if;
  select count(*) filter (where status = 'warn'), count(*) filter (where status = 'urgent')
    into w, u from checkup_items where checkup_id = c.id;
  s := greatest(0, 100 - w * 4 - u * 12);
  if u > 0 then s := least(s, 69); end if;

  update vehicle_checkups
     set status = 'completed', score = s, notes = nullif(trim(left(p_notes, 2000)), ''),
         completed_at = now(), mechanic_finished_at = now(),
         mechanic_started_at = coalesce(mechanic_started_at, now()), updated_at = now()
   where id = c.id;
  return s;
end;
$$;

-- ── Fotos pelo link: pasta {workshop}/{checkup}/m-{upload_key}/ ─────────────
create or replace function public.checkup_mech_upload_ok(p_checkup text, p_folder text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from vehicle_checkups c
     where c.id::text = p_checkup
       and c.mechanic_upload_key is not null
       and p_folder = 'm-' || c.mechanic_upload_key
       and c.status = 'draft'
       and c.mechanic_token_expires_at > now());
$$;

drop policy if exists checkup_photos_mechanic_link_insert on storage.objects;
create policy checkup_photos_mechanic_link_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'checkup-photos'
    and public.checkup_mech_upload_ok((storage.foldername(name))[2], (storage.foldername(name))[3]));

revoke all on function public._mech_checkup(text, text, boolean) from public, anon, authenticated;
revoke all on function public.checkup_send_to_mechanic(uuid) from public, anon;
revoke all on function public.mech_checkup_open(text, text) from public;
revoke all on function public.mech_checkup_pin(text, text) from public;
revoke all on function public.mech_checkup_update_items(text, text, uuid[], jsonb) from public;
revoke all on function public.mech_checkup_add_item(text, text, text, text) from public;
revoke all on function public.mech_checkup_remove_item(text, text, uuid) from public;
revoke all on function public.mech_checkup_finish(text, text, text) from public;
revoke all on function public.checkup_mech_upload_ok(text, text) from public;

grant execute on function public.checkup_send_to_mechanic(uuid) to authenticated;
grant execute on function public.mech_checkup_open(text, text) to anon, authenticated;
grant execute on function public.mech_checkup_pin(text, text) to anon, authenticated;
grant execute on function public.mech_checkup_update_items(text, text, uuid[], jsonb) to anon, authenticated;
grant execute on function public.mech_checkup_add_item(text, text, text, text) to anon, authenticated;
grant execute on function public.mech_checkup_remove_item(text, text, uuid) to anon, authenticated;
grant execute on function public.mech_checkup_finish(text, text, text) to anon, authenticated;
grant execute on function public.checkup_mech_upload_ok(text, text) to anon, authenticated;
