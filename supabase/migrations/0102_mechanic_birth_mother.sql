-- Data de nascimento e nome da mãe do mecânico: insumo da verificação de cadastro
-- (Receita Federal/CPF pede nascimento; antecedentes PF e mandados CNJ usam nome da mãe).

alter table public.mechanics
  add column if not exists birth_date date,
  add column if not exists mother_name text;

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role text;
  v_indicado_por uuid;
  v_codigo text;
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
    v_codigo := NEW.raw_user_meta_data->>'indicado_por_codigo';
    if v_codigo is not null and length(trim(v_codigo)) > 0 then
      v_indicado_por := public.resolver_codigo_indicacao(v_codigo);
    end if;

    insert into public.mechanics (
      profile_id, cpf, cnh, skills, experience_years, hourly_rate, pix_key,
      cep, neighborhood, city, state, work_reference, indicado_por,
      birth_date, mother_name
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
      nullif(NEW.raw_user_meta_data->>'work_reference', ''),
      v_indicado_por,
      nullif(NEW.raw_user_meta_data->>'birth_date', '')::date,
      nullif(trim(NEW.raw_user_meta_data->>'mother_name'), '')
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
