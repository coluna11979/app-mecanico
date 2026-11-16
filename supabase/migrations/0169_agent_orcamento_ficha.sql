-- Orçamentista + Consulta técnica (óleo e filtros).
--
-- O agente passa a:
--  1) completar o cadastro do carro (marca, modelo, ano) — só o que está vazio;
--  2) achar a ficha técnica do carro (tech_vehicles) e mostrar óleo (viscosidade, norma, litros) e filtros,
--     já cruzando com as peças do cadastro da oficina (mesma lógica de Servicos.tsx → pickTechCar);
--  3) quando o dono confirma: criar as peças que faltam no cadastro, montar o KIT do serviço para esse carro
--     na Tabela de serviços (workshop_service_parts por tech_vehicle_id), vincular o carro à ficha e,
--     se o dono mandar, marcar a ficha como conferida (mesmo efeito do botão "Conferi, aprovar ficha").
--
-- Só com o módulo 'consulta' ligado na oficina. Só o service_role executa (edge function agent-chat).
-- A ficha é global (vale para todas as oficinas): por isso "marcar como conferida" só acontece quando o dono pede.

create or replace function public.orc_token(t text)
returns text language sql stable set search_path = public as
$$ select regexp_replace(upper(unaccent(coalesce(t, ''))), '[^A-Z0-9]', '', 'g') $$;

/* ── Completar o cadastro do carro ─────────────────────────────────────────── */
create or replace function public.orc_update_vehicle(p_workshop uuid, p_os_number integer, p_marca text, p_modelo text, p_ano integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os    service_orders%rowtype;
  v       vehicles%rowtype;
  v_make  text := left(btrim(coalesce(p_marca, '')), 60);
  v_model text := left(btrim(coalesce(p_modelo, '')), 60);
  v_year  integer := case when p_ano between 1950 and extract(year from now())::int + 1 then p_ano end;
  v_skip  jsonb := '[]'::jsonb;
begin
  select * into v_os from service_orders where workshop_id = p_workshop and number = p_os_number order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'os_nao_encontrada'); end if;
  if v_os.vehicle_id is null then return jsonb_build_object('ok', false, 'error', 'os_sem_carro'); end if;

  -- Só completa o que está vazio ("Não informado" também conta como vazio); dado já preenchido não é trocado por aqui
  update vehicles set
    make  = case when v_make <> '' and (btrim(coalesce(make, '')) = '' or orc_norm(make) = 'nao informado') then v_make else make end,
    model = case when v_model <> '' and (btrim(coalesce(model, '')) = '' or orc_norm(model) = 'nao informado') then v_model else model end,
    year  = case when v_year is not null and year is null then v_year else year end
  where id = v_os.vehicle_id and workshop_id = p_workshop
  returning * into v;
  if not found then return jsonb_build_object('ok', false, 'error', 'carro_nao_encontrado'); end if;

  if v_make <> '' and orc_norm(v.make) <> orc_norm(v_make) then v_skip := v_skip || to_jsonb('marca'::text); end if;
  if v_model <> '' and orc_norm(v.model) <> orc_norm(v_model) then v_skip := v_skip || to_jsonb('modelo'::text); end if;
  if v_year is not null and v.year is distinct from v_year then v_skip := v_skip || to_jsonb('ano'::text); end if;

  return jsonb_build_object('ok', true,
    'carro', jsonb_build_object('marca', v.make, 'modelo', v.model, 'ano', v.year, 'placa', v.plate),
    'nao_alterado_porque_ja_estava_preenchido', v_skip);
end $$;

/* ── Ficha técnica do carro da OS ──────────────────────────────────────────── */
create or replace function public.orc_tech_sheet(p_workshop uuid, p_os_number integer, p_ficha uuid default null, p_servico uuid default null, p_escolha text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_os      service_orders%rowtype;
  v_veh     vehicles%rowtype;
  v_tv      tech_vehicles%rowtype;
  v_car     jsonb;
  v_cands   jsonb;
  v_n       integer := 0;
  v_match   boolean := false;
  v_fluid   tech_fluid_specs%rowtype;
  v_liters  numeric;
  v_stock   jsonb := '[]'::jsonb;
  v_filters jsonb;
  v_sug     jsonb := '[]'::jsonb;
  v_total   integer;
  v_draft   integer;
  f         record;
  cand      jsonb;
  v_years   text;
begin
  if not workshop_module_enabled(p_workshop, 'consulta') then
    return jsonb_build_object('ok', false, 'error', 'modulo_consulta_desligado');
  end if;
  select * into v_os from service_orders where workshop_id = p_workshop and number = p_os_number order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'os_nao_encontrada'); end if;
  if v_os.vehicle_id is null then return jsonb_build_object('ok', false, 'error', 'os_sem_carro'); end if;
  select * into v_veh from vehicles where id = v_os.vehicle_id;
  v_car := jsonb_build_object('marca', v_veh.make, 'modelo', v_veh.model, 'ano', v_veh.year, 'placa', v_veh.plate);

  -- Sem modelo no cadastro não há como achar a ficha: o agente completa o carro primeiro
  if btrim(coalesce(v_veh.model, '')) = '' or orc_norm(v_veh.model) = 'nao informado' then
    return jsonb_build_object('ok', false, 'error', 'carro_sem_modelo', 'carro', v_car);
  end if;

  -- Qual ficha: a escolhida agora, a já vinculada ao carro, ou a que bate com modelo e ano
  if p_ficha is not null then
    select * into v_tv from tech_vehicles where id = p_ficha;
    if not found then return jsonb_build_object('ok', false, 'error', 'ficha_invalida'); end if;
  elsif v_veh.tech_vehicle_id is not null then
    select * into v_tv from tech_vehicles where id = v_veh.tech_vehicle_id;
  end if;

  if v_tv.id is null then
    with base as (
      select t.* from tech_vehicles t
       where orc_norm(t.model) like '%' || orc_norm(v_veh.model) || '%'
         and (v_veh.year is null or ((t.year_from is null or t.year_from <= v_veh.year) and (t.year_to is null or t.year_to >= v_veh.year)))
    ), exato as (
      -- "Onix" antes de "Onix Plus"
      select * from base where orc_token(model) = orc_token(v_veh.model)
    ), por_nome as (
      select * from exato union all select * from base where not exists (select 1 from exato)
    ), pick as (
      -- Se a marca do carro bate com alguma, fica só com ela
      select * from por_nome where orc_norm(make) = orc_norm(v_veh.make)
      union all
      select * from por_nome where not exists (select 1 from por_nome where orc_norm(make) = orc_norm(v_veh.make))
    ), marc as (
      -- O dono já disse qual é ("LT 1.0", "1.4"): cada palavra dita tem que começar alguma palavra da versão/motor/combustível/câmbio
      select pick.*,
             (btrim(coalesce(p_escolha, '')) <> '' and not exists (
                select 1 from unnest(string_to_array(regexp_replace(orc_norm(p_escolha), '[^a-z0-9. ]', ' ', 'g'), ' ')) t
                 where t <> '' and not exists (
                   select 1 from unnest(string_to_array(regexp_replace(orc_norm(concat_ws(' ', pick.version, pick.engine, pick.fuel, pick.transmission)), '[^a-z0-9. ]', ' ', 'g'), ' ')) w
                    where w like t || '%'))) as m
        from pick
    ), final as (
      select * from marc where m or not exists (select 1 from marc where m)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'ficha_id', x.id, 'marca', x.make, 'modelo', x.model, 'versao', x.version, 'motor', x.engine,
             'combustivel', x.fuel, 'cambio', x.transmission,
             'anos', case when x.year_from is null and x.year_to is null then null
                          when x.year_from is not null and x.year_to is not null then
                            case when x.year_from = x.year_to then x.year_from::text else x.year_from || '–' || x.year_to end
                          when x.year_from is not null then x.year_from || ' em diante' else 'até ' || x.year_to end
           ) order by x.make, x.model, x.year_from nulls first, x.version), '[]'::jsonb),
           count(*),
           (select coalesce(bool_or(m), false) from marc)
      into v_cands, v_n, v_match
      from (select * from final order by make, model, year_from nulls first, version limit 12) x;

    if v_n = 0 then
      return jsonb_build_object('ok', true, 'ficha', null, 'motivo', 'modelo_sem_ficha', 'carro', v_car);
    elsif v_n > 1 then
      return jsonb_build_object('ok', true, 'ficha', null, 'motivo', 'escolher_versao', 'carro', v_car, 'candidatos', v_cands,
                                'escolha_nao_encontrada', btrim(coalesce(p_escolha, '')) <> '' and not v_match);
    end if;
    select * into v_tv from tech_vehicles where id = (v_cands->0->>'ficha_id')::uuid;
  end if;

  -- Óleo do motor
  select * into v_fluid from tech_fluid_specs where vehicle_id = v_tv.id and system = 'motor' order by position, created_at limit 1;
  -- A ficha traz a capacidade quebrada (3,2 L); óleo se separa em litro fechado, então o kit leva o inteiro de cima
  v_liters := greatest(1, ceil(coalesce(v_fluid.capacity_liters, 1) - 0.000000001));
  if v_fluid.id is not null and length(orc_token(v_fluid.viscosity)) >= 3 then
    select coalesce(jsonb_agg(jsonb_build_object('peca_id', p.id, 'nome', p.name, 'marca', p.brand, 'custo', p.cost, 'estoque', p.stock_qty)
                              order by (p.stock_qty > 0) desc, p.cost, p.name), '[]'::jsonb)
      into v_stock
      from (select * from workshop_parts p0
             where p0.workshop_id = p_workshop and p0.active and orc_token(p0.name) like '%' || orc_token(v_fluid.viscosity) || '%'
             order by (p0.stock_qty > 0) desc, p0.cost, p0.name limit 5) p;
    cand := v_stock->0;
    v_sug := v_sug || jsonb_build_object(
      'tipo', 'oleo', 'opcional', false, 'qtd', v_liters,
      'descricao', coalesce(cand->>'nome', 'Óleo do motor ' || v_fluid.viscosity),
      'peca_id', cand->>'peca_id', 'no_cadastro', cand is not null, 'custo', cand->'custo');
  end if;

  -- Filtros (óleo entra na sugestão; ar, combustível e cabine ficam como opcionais)
  v_filters := '[]'::jsonb;
  for f in select * from tech_filter_refs r where r.vehicle_id = v_tv.id
            order by array_position(array['oleo', 'ar', 'combustivel', 'cabine'], r.kind), r.position, r.created_at loop
    cand := (select coalesce(jsonb_agg(jsonb_build_object('peca_id', p.id, 'nome', p.name, 'custo', p.cost, 'estoque', p.stock_qty)), '[]'::jsonb)
               from (select * from workshop_parts p0
                      where p0.workshop_id = p_workshop and p0.active and length(orc_token(f.code)) >= 3
                        and (orc_token(p0.code) = orc_token(f.code) or orc_token(p0.name) like '%' || orc_token(f.code) || '%')
                      order by (p0.stock_qty > 0) desc, p0.cost, p0.name limit 3) p);
    v_filters := v_filters || jsonb_build_object('tipo', f.kind, 'marca', f.brand, 'codigo', f.code, 'status', f.status,
                                                 'obs', f.notes, 'pecas_no_cadastro', cand);
    v_sug := v_sug || jsonb_build_object(
      'tipo', 'filtro_' || f.kind, 'opcional', f.kind <> 'oleo', 'qtd', 1,
      'descricao', coalesce(cand->0->>'nome', 'Filtro ' || case f.kind when 'oleo' then 'de óleo' when 'ar' then 'de ar'
                                                  when 'combustivel' then 'de combustível' else 'de cabine' end || ' ' || f.brand || ' ' || f.code),
      'peca_id', cand->0->>'peca_id', 'no_cadastro', jsonb_array_length(cand) > 0, 'custo', cand->0->'custo',
      'marca', f.brand, 'codigo', f.code);
  end loop;

  select count(*), count(*) filter (where s <> 'verificado') into v_total, v_draft
    from (select status as s from tech_fluid_specs where vehicle_id = v_tv.id
          union all select status from tech_filter_refs where vehicle_id = v_tv.id) t;

  v_years := case when v_tv.year_from is null and v_tv.year_to is null then null
                  when v_tv.year_from is not null and v_tv.year_to is not null then
                    case when v_tv.year_from = v_tv.year_to then v_tv.year_from::text else v_tv.year_from || '–' || v_tv.year_to end
                  when v_tv.year_from is not null then v_tv.year_from || ' em diante' else 'até ' || v_tv.year_to end;

  return jsonb_build_object('ok', true,
    'ficha', jsonb_build_object('ficha_id', v_tv.id, 'marca', v_tv.make, 'modelo', v_tv.model, 'versao', v_tv.version,
                                'motor', v_tv.engine, 'combustivel', v_tv.fuel, 'cambio', v_tv.transmission, 'anos', v_years),
    'carro', v_car,
    'ja_vinculada_ao_carro', v_veh.tech_vehicle_id is not distinct from v_tv.id,
    'verificada', v_total > 0 and v_draft = 0,
    'linhas_em_rascunho', v_draft,
    'oleo', case when v_fluid.id is null then null else jsonb_build_object(
              'viscosidade', v_fluid.viscosity, 'norma', v_fluid.spec, 'litros_da_ficha', v_fluid.capacity_liters,
              'litros_no_kit', v_liters, 'troca_km', v_fluid.interval_km, 'troca_meses', v_fluid.interval_months,
              'obs', v_fluid.notes, 'status', v_fluid.status, 'pecas_no_cadastro', v_stock) end,
    'filtros', v_filters,
    'sugestao_kit', v_sug,
    'kit_ja_existe_para_este_servico', case when p_servico is null then null else exists (
        select 1 from workshop_service_parts k where k.workshop_id = p_workshop and k.service_id = p_servico and k.tech_vehicle_id = v_tv.id) end);
end $$;

/* ── Salvar peças + kit do serviço para o carro (e conferir a ficha, se o dono mandar) ───────────── */
create or replace function public.orc_save_kit(
  p_workshop uuid, p_os_number integer, p_servico uuid, p_ficha uuid, p_pecas jsonb, p_verify boolean, p_user uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os       service_orders%rowtype;
  v_svc      workshop_services%rowtype;
  v_tv       tech_vehicles%rowtype;
  e          jsonb;
  r          jsonb;
  pp         workshop_parts%rowtype;
  v_tipo     text;
  v_name     text;
  v_qty      numeric;
  v_resolved jsonb := '[]'::jsonb;
  v_problems jsonb := '[]'::jsonb;
  v_created  jsonb := '[]'::jsonb;
  v_part_id  uuid;
  v_pos      integer;
  v_new      integer := 0;
  v_skip     integer := 0;
  v_ver_f    integer := 0;
  v_ver_r    integer := 0;
begin
  if not workshop_module_enabled(p_workshop, 'consulta') then
    return jsonb_build_object('ok', false, 'error', 'modulo_consulta_desligado');
  end if;
  -- Defesa em profundidade: quem pede precisa ser da oficina (a edge function passa o usuário logado)
  if p_user is null or not (is_workshop_member(p_workshop, p_user) or is_admin(p_user)) then
    return jsonb_build_object('ok', false, 'error', 'sem_permissao');
  end if;

  select * into v_os from service_orders where workshop_id = p_workshop and number = p_os_number order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'os_nao_encontrada'); end if;
  if v_os.vehicle_id is null then return jsonb_build_object('ok', false, 'error', 'os_sem_carro'); end if;
  select * into v_svc from workshop_services where id = p_servico and workshop_id = p_workshop;
  if not found then return jsonb_build_object('ok', false, 'error', 'servico_invalido'); end if;
  select * into v_tv from tech_vehicles where id = p_ficha;
  if not found then return jsonb_build_object('ok', false, 'error', 'ficha_invalida'); end if;
  if p_pecas is null or jsonb_typeof(p_pecas) <> 'array' or jsonb_array_length(p_pecas) = 0 then
    return jsonb_build_object('ok', false, 'error', 'sem_pecas');
  end if;

  -- 1ª passada: resolve cada peça, sem gravar nada
  for e in select * from jsonb_array_elements(p_pecas) loop
    v_tipo := coalesce(e->>'tipo', '');
    v_qty := coalesce(nullif(e->>'qtd', '')::numeric, 1);
    if v_qty <= 0 then v_qty := 1; end if;
    pp := null; v_name := left(btrim(coalesce(e->>'nome', '')), 120);

    if v_tipo not in ('oleo', 'filtro_oleo', 'filtro_ar', 'filtro_combustivel', 'filtro_cabine') then
      v_problems := v_problems || jsonb_build_object('peca', coalesce(nullif(v_name, ''), v_tipo), 'problema', 'tipo_invalido');
      continue;
    end if;

    if nullif(e->>'peca_id', '') is not null then
      select * into pp from workshop_parts where id = (e->>'peca_id')::uuid and workshop_id = p_workshop and active;
      if pp.id is null then
        v_problems := v_problems || jsonb_build_object('peca', coalesce(nullif(v_name, ''), e->>'peca_id'), 'problema', 'peca_id_invalido');
        continue;
      end if;
    else
      if v_name = '' then
        v_problems := v_problems || jsonb_build_object('peca', v_tipo, 'problema', 'sem_nome');
        continue;
      end if;
      -- Já existe peça com esse nome no cadastro? Usa ela (não duplica)
      select * into pp from workshop_parts where workshop_id = p_workshop and active and orc_norm(name) = orc_norm(v_name) limit 1;
      if pp.id is null and (nullif(e->>'custo', '') is null or (e->>'custo')::numeric < 0) then
        v_problems := v_problems || jsonb_build_object('peca', v_name, 'problema', 'sem_custo');
        continue;
      end if;
    end if;

    v_resolved := v_resolved || jsonb_build_object(
      'tipo', v_tipo, 'qty', v_qty, 'part_id', pp.id, 'name', coalesce(pp.name, v_name),
      'brand', nullif(left(btrim(coalesce(e->>'marca', '')), 60), ''), 'code', nullif(left(btrim(coalesce(e->>'codigo', '')), 60), ''),
      'cost', nullif(e->>'custo', '')::numeric);
  end loop;

  if jsonb_array_length(v_problems) > 0 then
    return jsonb_build_object('ok', false, 'error', 'revisar_pecas', 'problemas', v_problems);
  end if;

  -- 2ª passada: cria as peças que faltam e monta o kit do serviço para este carro
  select coalesce(max(position), -1) + 1 into v_pos from workshop_service_parts where service_id = p_servico;
  for r in select * from jsonb_array_elements(v_resolved) loop
    v_part_id := nullif(r->>'part_id', '')::uuid;
    if v_part_id is null then
      insert into workshop_parts (workshop_id, name, code, brand, unit, category, cost, active)
      values (p_workshop, r->>'name', r->>'code', r->>'brand',
              case when r->>'tipo' = 'oleo' then 'litro' else 'un' end, 'oleos_filtros', (r->>'cost')::numeric, true)
      returning id into v_part_id;
      v_created := v_created || to_jsonb(r->>'name');
    end if;

    -- O mesmo item não entra duas vezes no kit deste carro
    if exists (select 1 from workshop_service_parts k
                where k.workshop_id = p_workshop and k.service_id = p_servico and k.tech_vehicle_id = v_tv.id
                  and (k.part_id = v_part_id or orc_norm(k.description) = orc_norm(r->>'name'))) then
      v_skip := v_skip + 1;
    else
      insert into workshop_service_parts (workshop_id, service_id, part_id, description, quantity, position,
                                          vehicle_model, tech_vehicle_id, vehicle_make, vehicle_engine, year_from, year_to)
      values (p_workshop, p_servico, v_part_id, r->>'name', (r->>'qty')::numeric, v_pos,
              v_tv.model, v_tv.id, v_tv.make, coalesce(v_tv.engine, v_tv.version), v_tv.year_from, v_tv.year_to);
      v_pos := v_pos + 1; v_new := v_new + 1;
    end if;
  end loop;

  -- A versão/motor escolhida fica no carro do cliente (na próxima visita a ficha abre direto)
  update vehicles set tech_vehicle_id = v_tv.id where id = v_os.vehicle_id and workshop_id = p_workshop;

  -- "Conferi, aprovar ficha": só quando o dono mandou. A ficha é global, então passa a valer para todos.
  if coalesce(p_verify, false) then
    update tech_fluid_specs set status = 'verificado', verified_by = p_user, verified_at = now() where vehicle_id = v_tv.id and status = 'rascunho';
    get diagnostics v_ver_f = row_count;
    update tech_filter_refs set status = 'verificado', verified_by = p_user, verified_at = now() where vehicle_id = v_tv.id and status = 'rascunho';
    get diagnostics v_ver_r = row_count;
  end if;

  return jsonb_build_object('ok', true, 'servico', v_svc.name,
    'ficha', jsonb_build_object('marca', v_tv.make, 'modelo', v_tv.model, 'motor', coalesce(v_tv.engine, v_tv.version)),
    'pecas_criadas_no_cadastro', v_created, 'kit_linhas_criadas', v_new, 'kit_linhas_que_ja_existiam', v_skip,
    'carro_vinculado_a_ficha', true, 'ficha_marcada_como_conferida', coalesce(p_verify, false), 'linhas_conferidas', v_ver_f + v_ver_r);
end $$;

/* ── Permissões: só o service_role (edge function) executa ─────────────────── */
do $$
declare f text;
begin
  foreach f in array array[
    'orc_token(text)', 'orc_update_vehicle(uuid,integer,text,text,integer)',
    'orc_tech_sheet(uuid,integer,uuid,uuid,text)', 'orc_save_kit(uuid,integer,uuid,uuid,jsonb,boolean,uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
