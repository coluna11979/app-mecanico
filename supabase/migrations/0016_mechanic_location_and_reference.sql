-- Adiciona campos de localização e referência de trabalho para mecânicos.
-- Também rearma o trigger handle_new_user pra ler esses novos campos + os de
-- endereço detalhado da oficina (cep, number, neighborhood) do raw_user_meta_data.

alter table public.mechanics
  add column if not exists cep            text,
  add column if not exists neighborhood   text,
  add column if not exists city           text,
  add column if not exists state          text,
  add column if not exists work_reference text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text;
begin
  v_role := NEW.raw_user_meta_data->>'role';

  if v_role is null or v_role not in ('mechanic', 'workshop', 'admin') then
    return NEW;
  end if;

  insert into public.profiles (id, role, full_name, phone, status)
  values (
    NEW.id,
    v_role::user_role,
    coalesce(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone',
    'pending'
  );

  if v_role = 'mechanic' then
    insert into public.mechanics (
      profile_id, cpf, cnh, skills, experience_years, hourly_rate, pix_key,
      cep, neighborhood, city, state, work_reference
    )
    values (
      NEW.id,
      coalesce(NEW.raw_user_meta_data->>'cpf', ''),
      nullif(NEW.raw_user_meta_data->>'cnh', ''),
      array(select jsonb_array_elements_text((NEW.raw_user_meta_data->'skills')::jsonb)),
      coalesce((NEW.raw_user_meta_data->>'experience_years')::int, 0),
      coalesce((NEW.raw_user_meta_data->>'hourly_rate')::numeric, 0),
      nullif(NEW.raw_user_meta_data->>'pix_key', ''),
      nullif(NEW.raw_user_meta_data->>'cep', ''),
      nullif(NEW.raw_user_meta_data->>'neighborhood', ''),
      nullif(NEW.raw_user_meta_data->>'city', ''),
      nullif(NEW.raw_user_meta_data->>'state', ''),
      nullif(NEW.raw_user_meta_data->>'work_reference', '')
    );
  end if;

  if v_role = 'workshop' then
    insert into public.workshops (
      profile_id, business_name, cnpj, address, city, state, description,
      cep, number, neighborhood
    )
    values (
      NEW.id,
      coalesce(NEW.raw_user_meta_data->>'business_name', ''),
      coalesce(NEW.raw_user_meta_data->>'cnpj', ''),
      coalesce(NEW.raw_user_meta_data->>'address', ''),
      coalesce(NEW.raw_user_meta_data->>'city', ''),
      coalesce(NEW.raw_user_meta_data->>'state', 'SP'),
      nullif(NEW.raw_user_meta_data->>'description', ''),
      nullif(NEW.raw_user_meta_data->>'cep', ''),
      nullif(NEW.raw_user_meta_data->>'number', ''),
      nullif(NEW.raw_user_meta_data->>'neighborhood', '')
    );
  end if;

  return NEW;
end;
$function$;
