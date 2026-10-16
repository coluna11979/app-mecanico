-- SEGURANÇA: chaves secretas estavam com is_public = true e podiam ser lidas por
-- qualquer usuário logado (settings_read libera is_public para autenticados).
-- Edge Functions leem com a service role (ignora RLS), então nada quebra.

create or replace function public.is_secret_setting_key(k text)
returns boolean
language sql
immutable
as $$
  select k ilike any (array['%secret%', '%api_key%', '%webhook%', '%password%', '%private%', 'pix_client_%', '%_token'])
     and k not in ('mapbox_token');  -- token público do Mapbox (pk.*) é usado no navegador
$$;

update public.app_settings set is_public = false where public.is_secret_setting_key(key);

-- Toda chave secreta nova (ou atualizada pelo painel admin) fica privada automaticamente
create or replace function public.trg_app_settings_secret_private()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_secret_setting_key(new.key) then
    new.is_public := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_app_settings_secret_private on public.app_settings;
create trigger trg_app_settings_secret_private
  before insert or update on public.app_settings
  for each row execute function public.trg_app_settings_secret_private();
