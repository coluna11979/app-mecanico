-- =========================================================
-- Programa de Embaixadores (validação inicial)
--
-- Modelo:
--   • Admin marca mecânico como embaixador, gera código único.
--   • Cadastro com ?ref=<codigo> amarra o novo mecânico ao embaixador.
--   • A cada job concluído do indicado, se o embaixador estiver
--     ativo (>=1 serviço nos últimos 30d OU virou embaixador
--     nos últimos 30d) e dentro dos 12 meses do programa,
--     grava uma comissão = 20% do take da plataforma (padrão).
--   • Indicado nunca sabe da existência da comissão.
-- =========================================================

-- Colunas em mechanics ------------------------------------
alter table public.mechanics
  add column if not exists is_embaixador     boolean     not null default false,
  add column if not exists codigo_indicacao  text        unique,
  add column if not exists embaixador_desde  timestamptz,
  add column if not exists embaixador_ate    timestamptz,
  add column if not exists indicado_por      uuid        references public.mechanics(id) on delete set null;

create index if not exists mechanics_codigo_indicacao_idx on public.mechanics(codigo_indicacao) where codigo_indicacao is not null;
create index if not exists mechanics_indicado_por_idx     on public.mechanics(indicado_por)     where indicado_por is not null;

-- Config: % da comissão --------------------------------------
insert into public.app_settings (key, value, description) values
  ('embaixador_comissao_percent', '20', 'Percentual do take da plataforma pago ao embaixador (%)'),
  ('embaixador_programa_meses',   '12', 'Duração do programa de embaixador em meses')
on conflict (key) do nothing;

-- Tabela de comissões --------------------------------------
create table if not exists public.comissoes_embaixador (
  id uuid primary key default uuid_generate_v4(),
  embaixador_id uuid not null references public.mechanics(id) on delete cascade,
  indicado_id   uuid not null references public.mechanics(id) on delete cascade,
  job_id        uuid not null unique references public.jobs(id) on delete cascade,
  bruto         numeric(10,2) not null,
  platform_fee  numeric(10,2) not null,
  comissao      numeric(10,2) not null,
  criado_em     timestamptz not null default now(),
  pago_em       timestamptz,
  pago_valor    numeric(10,2),
  pago_por      uuid references auth.users(id)
);
create index if not exists comissoes_embaixador_id_idx on public.comissoes_embaixador(embaixador_id, criado_em desc);
create index if not exists comissoes_pendentes_idx     on public.comissoes_embaixador(embaixador_id) where pago_em is null;

alter table public.comissoes_embaixador enable row level security;

-- Embaixador vê as próprias; admin vê tudo
drop policy if exists comissoes_select on public.comissoes_embaixador;
create policy comissoes_select on public.comissoes_embaixador for select
  using (
    public.is_admin(auth.uid())
    or embaixador_id in (select id from public.mechanics where profile_id = auth.uid())
  );

-- Só admin escreve
drop policy if exists comissoes_admin_write on public.comissoes_embaixador;
create policy comissoes_admin_write on public.comissoes_embaixador for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- =========================================================
-- HELPERS
-- =========================================================

-- Verifica se um embaixador está "ativo" (regra do programa).
-- Ativo = está no período de 12 meses AND (fez 1 serviço nos últimos 30 dias
-- OU virou embaixador há menos de 30 dias — grace period inicial).
create or replace function public.embaixador_ativo(p_mechanic_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    m.is_embaixador
    and (m.embaixador_ate is null or m.embaixador_ate > now())
    and (
      m.embaixador_desde > now() - interval '30 days'
      or exists (
        select 1 from public.jobs j
        where j.mechanic_id = m.id
          and j.status = 'completed'
          and coalesce(j.workshop_confirmed_at, j.completed_at) > now() - interval '30 days'
      )
    )
  from public.mechanics m
  where m.id = p_mechanic_id;
$$;

-- Gera um código único a partir do nome do mecânico (ex.: MARCELO7X4)
create or replace function public.gerar_codigo_indicacao(p_full_name text)
returns text
language plpgsql as $$
declare
  v_base text;
  v_codigo text;
  v_try int := 0;
begin
  -- Pega primeiro nome, normaliza (uppercase, remove acentos, só letras)
  v_base := upper(regexp_replace(
    unaccent(coalesce(split_part(p_full_name, ' ', 1), 'MEC')),
    '[^A-Za-z]', '', 'g'
  ));
  if v_base = '' then v_base := 'MEC'; end if;
  v_base := left(v_base, 8);

  loop
    v_codigo := v_base || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    v_codigo := upper(v_codigo);
    exit when not exists (select 1 from public.mechanics where codigo_indicacao = v_codigo);
    v_try := v_try + 1;
    if v_try > 10 then
      v_codigo := v_base || substr(md5(random()::text), 1, 6);
      exit;
    end if;
  end loop;

  return v_codigo;
end;
$$;

-- unaccent pode não estar disponível — cria extensão se não tiver.
create extension if not exists unaccent;

-- =========================================================
-- RPCs: admin gerencia embaixadores
-- =========================================================

-- Tornar mecânico embaixador (admin-only).
create or replace function public.tornar_embaixador(p_mechanic_id uuid)
returns text                       -- retorna o código gerado
language plpgsql security definer set search_path = public as $$
declare
  v_full_name text;
  v_codigo text;
  v_meses int;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  select p.full_name into v_full_name
    from public.profiles p
    join public.mechanics m on m.profile_id = p.id
   where m.id = p_mechanic_id;

  if v_full_name is null then
    raise exception 'mecânico não encontrado';
  end if;

  select coalesce((value)::int, 12) into v_meses
    from public.app_settings where key = 'embaixador_programa_meses';

  -- Se já é embaixador e tem código, retorna o existente
  select codigo_indicacao into v_codigo
    from public.mechanics
   where id = p_mechanic_id and is_embaixador and codigo_indicacao is not null;

  if v_codigo is not null then
    return v_codigo;
  end if;

  v_codigo := public.gerar_codigo_indicacao(v_full_name);

  update public.mechanics
     set is_embaixador    = true,
         codigo_indicacao = v_codigo,
         embaixador_desde = coalesce(embaixador_desde, now()),
         embaixador_ate   = coalesce(embaixador_ate, now() + (v_meses || ' months')::interval)
   where id = p_mechanic_id;

  return v_codigo;
end;
$$;

-- Revogar embaixador (admin-only). Mantém código e histórico
-- de comissões, só desliga a flag ativa.
create or replace function public.revogar_embaixador(p_mechanic_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  update public.mechanics
     set is_embaixador = false
   where id = p_mechanic_id;
end;
$$;

-- Resolver código → mechanic_id do embaixador (público, chamado no signup).
-- Retorna NULL se o código não existe, o mecânico não é mais embaixador,
-- ou o programa dele já venceu.
create or replace function public.resolver_codigo_indicacao(p_codigo text)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.mechanics
   where codigo_indicacao = upper(trim(p_codigo))
     and is_embaixador
     and (embaixador_ate is null or embaixador_ate > now())
   limit 1;
$$;
grant execute on function public.resolver_codigo_indicacao(text) to anon, authenticated;

-- =========================================================
-- Trigger de comissão: quando o repasse é pago, se o
-- mecânico tem indicado_por e o embaixador está ativo,
-- grava a comissão.
-- =========================================================
create or replace function public.registrar_comissao_embaixador()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_indicado_por uuid;
  v_bruto        numeric;
  v_fee_pct      numeric;
  v_com_pct      numeric;
  v_platform_fee numeric;
  v_comissao     numeric;
begin
  -- Só dispara quando repasse_pago_at acaba de ser setado (NULL -> valor)
  if old.repasse_pago_at is not null or new.repasse_pago_at is null then
    return new;
  end if;

  if new.mechanic_id is null then return new; end if;

  select indicado_por into v_indicado_por
    from public.mechanics where id = new.mechanic_id;

  if v_indicado_por is null then return new; end if;
  if not public.embaixador_ativo(v_indicado_por) then return new; end if;

  -- bruto do serviço (valor pago pela oficina)
  v_bruto := coalesce(new.repasse_valor, 0) / 0.82;   -- back-calcula gross (repasse = 82% do bruto)
  -- Se preferirmos ler direto de price_per_hour × max_hours, fica mais preciso:
  v_bruto := coalesce(new.price_per_hour, 0) * coalesce(new.max_hours, 0);
  if v_bruto <= 0 then return new; end if;

  select coalesce((value)::numeric, 20) into v_com_pct
    from public.app_settings where key = 'embaixador_comissao_percent';
  select coalesce((value)::numeric, 18) into v_fee_pct
    from public.app_settings where key = 'platform_fee_percent';
  -- app_settings tem default 15, mas o app usa 18. Mantém 18 se não estiver batendo.
  if v_fee_pct < 15 then v_fee_pct := 18; end if;

  v_platform_fee := round(v_bruto * v_fee_pct / 100.0, 2);
  v_comissao     := round(v_platform_fee * v_com_pct / 100.0, 2);

  insert into public.comissoes_embaixador
    (embaixador_id, indicado_id, job_id, bruto, platform_fee, comissao)
  values
    (v_indicado_por, new.mechanic_id, new.id, v_bruto, v_platform_fee, v_comissao)
  on conflict (job_id) do nothing;

  return new;
end;
$$;

drop trigger if exists jobs_registrar_comissao on public.jobs;
create trigger jobs_registrar_comissao
  after update of repasse_pago_at on public.jobs
  for each row execute function public.registrar_comissao_embaixador();

-- =========================================================
-- Atualiza handle_new_user pra amarrar `indicado_por`
-- quando o cadastro chega com `indicado_por_codigo`.
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
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
      cep, neighborhood, city, state, work_reference, indicado_por
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
      v_indicado_por
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
$$;

-- =========================================================
-- RPC: resumo do embaixador (para a tela "Minhas Indicações")
-- =========================================================
create or replace function public.embaixador_resumo()
returns table (
  codigo_indicacao text,
  embaixador_desde timestamptz,
  embaixador_ate   timestamptz,
  total_indicados  int,
  ativos_30d       int,
  comissao_acumulada numeric,
  comissao_paga      numeric,
  comissao_pendente  numeric
)
language sql stable security definer set search_path = public as $$
  with me as (
    select m.id
      from public.mechanics m
     where m.profile_id = auth.uid()
       and m.is_embaixador
     limit 1
  )
  select
    (select codigo_indicacao from public.mechanics where id = (select id from me)),
    (select embaixador_desde from public.mechanics where id = (select id from me)),
    (select embaixador_ate   from public.mechanics where id = (select id from me)),
    (select count(*)::int    from public.mechanics where indicado_por = (select id from me)),
    (select count(*)::int    from public.mechanics ind
       where ind.indicado_por = (select id from me)
         and exists (
           select 1 from public.jobs j
            where j.mechanic_id = ind.id
              and j.status = 'completed'
              and coalesce(j.workshop_confirmed_at, j.completed_at) > now() - interval '30 days'
         )
    ),
    (select coalesce(sum(comissao), 0) from public.comissoes_embaixador where embaixador_id = (select id from me)),
    (select coalesce(sum(pago_valor), 0) from public.comissoes_embaixador where embaixador_id = (select id from me) and pago_em is not null),
    (select coalesce(sum(comissao), 0) from public.comissoes_embaixador where embaixador_id = (select id from me) and pago_em is null);
$$;
grant execute on function public.embaixador_resumo() to authenticated;

-- Lista os indicados do embaixador logado (com estatísticas).
create or replace function public.embaixador_indicados()
returns table (
  mechanic_id uuid,
  full_name text,
  cidade text,
  aprovado boolean,
  entrou_em timestamptz,
  servicos_total int,
  servicos_30d int,
  comissao_acumulada numeric
)
language sql stable security definer set search_path = public as $$
  with me as (
    select id from public.mechanics where profile_id = auth.uid() and is_embaixador limit 1
  )
  select
    m.id,
    p.full_name,
    m.city,
    (p.status = 'approved'),
    m.created_at,
    (select count(*)::int from public.jobs j where j.mechanic_id = m.id and j.status = 'completed'),
    (select count(*)::int from public.jobs j
      where j.mechanic_id = m.id and j.status = 'completed'
        and coalesce(j.workshop_confirmed_at, j.completed_at) > now() - interval '30 days'),
    (select coalesce(sum(c.comissao), 0)
       from public.comissoes_embaixador c
      where c.embaixador_id = (select id from me)
        and c.indicado_id = m.id)
  from public.mechanics m
  join public.profiles  p on p.id = m.profile_id
  where m.indicado_por = (select id from me)
  order by m.created_at desc;
$$;
grant execute on function public.embaixador_indicados() to authenticated;

-- =========================================================
-- RPC: listagem admin de todos embaixadores
-- =========================================================
create or replace function public.admin_listar_embaixadores()
returns table (
  mechanic_id uuid,
  profile_id uuid,
  full_name text,
  phone text,
  codigo_indicacao text,
  embaixador_desde timestamptz,
  embaixador_ate timestamptz,
  ativo boolean,
  total_indicados int,
  comissao_acumulada numeric,
  comissao_pendente numeric
)
language sql stable security definer set search_path = public as $$
  select
    m.id,
    p.id,
    p.full_name,
    p.phone,
    m.codigo_indicacao,
    m.embaixador_desde,
    m.embaixador_ate,
    public.embaixador_ativo(m.id),
    (select count(*)::int from public.mechanics where indicado_por = m.id),
    (select coalesce(sum(comissao), 0) from public.comissoes_embaixador where embaixador_id = m.id),
    (select coalesce(sum(comissao), 0) from public.comissoes_embaixador where embaixador_id = m.id and pago_em is null)
  from public.mechanics m
  join public.profiles p on p.id = m.profile_id
  where m.is_embaixador
  order by m.embaixador_desde desc nulls last;
$$;
grant execute on function public.admin_listar_embaixadores() to authenticated;

-- =========================================================
-- RPC: marcar comissão como paga (admin-only)
-- =========================================================
create or replace function public.admin_pagar_comissoes(
  p_embaixador_id uuid,
  p_valor numeric
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_updated int;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  update public.comissoes_embaixador
     set pago_em    = now(),
         pago_valor = comissao,
         pago_por   = auth.uid()
   where embaixador_id = p_embaixador_id
     and pago_em is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;
grant execute on function public.admin_pagar_comissoes(uuid, numeric) to authenticated;
