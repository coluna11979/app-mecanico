-- Orçamentista: achar a ficha técnica mesmo quando o cadastro do carro traz mais que o nome do modelo.
-- Ex.: o dono diz "Palio 1.0" e o carro fica com model = 'Palio 1.0'; a ficha do catálogo é 'Palio' (versão '1.0 8V ...').
-- Antes só casava quando o texto do carro estava DENTRO do nome do modelo do catálogo; agora (igual ao app, que procura o
-- nome do modelo do catálogo dentro do texto do carro):
--   1) nome igual; 2) o nome do modelo do catálogo está dentro do texto do carro (fica o mais específico:
--      "Onix Plus" ganha de "Onix"); 3) o texto do carro está dentro do nome do catálogo
--   e os números do texto do carro ("1.0", "16v") afunilam a versão, se acharem alguma.
-- Mesma assinatura da 0169 (create or replace; nada é apagado).

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
  v_hint    text;
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

  if btrim(coalesce(v_veh.model, '')) = '' or orc_norm(v_veh.model) = 'nao informado' then
    return jsonb_build_object('ok', false, 'error', 'carro_sem_modelo', 'carro', v_car);
  end if;

  if p_ficha is not null then
    select * into v_tv from tech_vehicles where id = p_ficha;
    if not found then return jsonb_build_object('ok', false, 'error', 'ficha_invalida'); end if;
  elsif v_veh.tech_vehicle_id is not null then
    select * into v_tv from tech_vehicles where id = v_veh.tech_vehicle_id;
  end if;

  if v_tv.id is null then
    -- O que o dono escolheu; senão, as palavras com número do próprio texto do carro ("1.0", "16v")
    v_hint := coalesce(nullif(btrim(coalesce(p_escolha, '')), ''),
                       (select string_agg(w, ' ') from unnest(string_to_array(orc_norm(v_veh.model), ' ')) w where w ~ '[0-9]'));

    with m as (
      select t.*, orc_token(t.model) as tt,
             case when orc_token(t.model) = orc_token(v_veh.model) then 0
                  when orc_token(v_veh.model) like '%' || orc_token(t.model) || '%' then 1
                  when orc_token(t.model) like '%' || orc_token(v_veh.model) || '%' then 2 end as rk
        from tech_vehicles t
       where length(orc_token(t.model)) >= 2
         and (v_veh.year is null or ((t.year_from is null or t.year_from <= v_veh.year) and (t.year_to is null or t.year_to >= v_veh.year)))
         and (orc_token(t.model) = orc_token(v_veh.model)
              or orc_token(v_veh.model) like '%' || orc_token(t.model) || '%'
              or orc_token(t.model) like '%' || orc_token(v_veh.model) || '%')
    ), por_nome as (
      -- Melhor grau de casamento; no 2º grau fica só o nome mais específico ("Onix Plus" antes de "Onix")
      select m.* from m
       where m.rk = (select min(rk) from m)
         and (m.rk <> 1 or length(m.tt) = (select max(length(tt)) from m where rk = 1))
    ), pick as (
      -- Se a marca do carro bate com alguma, fica só com ela
      select * from por_nome where orc_norm(make) = orc_norm(v_veh.make)
      union all
      select * from por_nome where not exists (select 1 from por_nome where orc_norm(make) = orc_norm(v_veh.make))
    ), marc as (
      select pick.*,
             (btrim(coalesce(v_hint, '')) <> '' and not exists (
                select 1 from unnest(string_to_array(regexp_replace(orc_norm(v_hint), '[^a-z0-9. ]', ' ', 'g'), ' ')) t
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

  select * into v_fluid from tech_fluid_specs where vehicle_id = v_tv.id and system = 'motor' order by position, created_at limit 1;
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

revoke all on function public.orc_tech_sheet(uuid, integer, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.orc_tech_sheet(uuid, integer, uuid, uuid, text) to service_role;
