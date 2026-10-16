-- 1) Endereço completo do mecânico (antes só CEP/bairro/cidade/UF).
-- 2) Dados de identidade travados depois da aprovação: a verificação (Receita/PF/CNJ)
--    é feita em cima de CPF + nascimento + nome da mãe; se o mecânico pudesse trocar
--    depois, a checagem perderia o valor. Só admin altera.

alter table public.mechanics
  add column if not exists address            text,
  add column if not exists address_number     text,
  add column if not exists address_complement text;

create or replace function public.mechanics_lock_identity()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if (NEW.cpf is distinct from OLD.cpf
      or NEW.birth_date is distinct from OLD.birth_date
      or NEW.mother_name is distinct from OLD.mother_name)
     and auth.uid() is not null                      -- service role / SQL do painel passam
     and not public.is_admin(auth.uid())
     and exists (select 1 from public.profiles p where p.id = OLD.profile_id and p.status = 'approved')
  then
    raise exception 'CPF, data de nascimento e nome da mãe não podem ser alterados depois da aprovação. Fale com o suporte.'
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$function$;

drop trigger if exists mechanics_lock_identity on public.mechanics;
create trigger mechanics_lock_identity
  before update on public.mechanics
  for each row execute function public.mechanics_lock_identity();

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
      birth_date, mother_name, address, address_number, address_complement
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
      nullif(trim(NEW.raw_user_meta_data->>'mother_name'), ''),
      nullif(trim(NEW.raw_user_meta_data->>'address'), ''),
      nullif(trim(NEW.raw_user_meta_data->>'address_number'), ''),
      nullif(trim(NEW.raw_user_meta_data->>'address_complement'), '')
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
