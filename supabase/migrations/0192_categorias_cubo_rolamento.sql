-- Categorias de peça novas: Cubo de roda ('cubo') e Rolamento ('rolamento'), separadas de "Rodas e pneus".

-- 1) Liberar as categorias
alter table workshop_parts drop constraint if exists workshop_parts_category_chk;
alter table workshop_parts add constraint workshop_parts_category_chk check (category = any (array[
  'freios','suspensao','motor','ignicao_injecao','eletrica','oleos_filtros','arrefecimento','transmissao',
  'rodas','cubo','rolamento','escapamento','ar_condicionado','carroceria','outros']));

-- 2) Classificação automática pelo nome (nota fiscal, planilha, agentes)
create or replace function guess_part_category(p_name text) returns text
language sql immutable as $$
  with n as (
    select ' ' || regexp_replace(
      translate(upper(coalesce(p_name, '')), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'),
      '[^A-Z0-9]+', ' ', 'g') || ' ' as s
  )
  select case
    when s ~ ' (FILTRO|LUBRIFICANTE|GRAXA|ATF) ' or s ~ '^ OLEO ' or s ~ ' OLEO [0-9]'            then 'oleos_filtros'
    when s ~ ' (EMBREAGEM|PLATO|COLAR|CAMBIO|SEMI ?EIXO|HOMOCINETICA|TRIZETA|TULIPA|COIFA|SINCRONIZADO) ' then 'transmissao'
    when s ~ ' (FREIO|FR|PASTILHA|SAPATA|LONA|TAMBOR|PINCA|CILINDRO MESTRE|CILINDRO RODA|SERVO FREIO|FLEXIVEL FREIO) ' then 'freios'
    when s ~ ' CUBOS? '                                                                            then 'cubo'
    when s ~ ' ROLAMENTOS? '                                                                       then 'rolamento'
    when s ~ ' (PNEU|RODA|CALOTA|CAMARA) '                                                         then 'rodas'
    when s ~ ' (AMORTECEDOR|MOLA|BANDEJA|PIVO|BIELETA|BUCHA|BATENTE|ESTABILIZADORA|TERMINAL|AXIAL|DIRECAO|COXIM AMORTECEDOR|KIT BATENTE|BALANCIM) ' then 'suspensao'
    when s ~ ' (COMPRESSOR|CONDENSADOR|EVAPORADOR|R134|AR CONDICIONADO|VALVULA EXPANSAO) '          then 'ar_condicionado'
    when s ~ ' (RADIADOR|AGUA|DAGUA|TERMOSTATICA|TERMOSTATO|ADITIVO|ARREFECIMENTO|RESERVATORIO|ELETROVENTILADOR|VENTOINHA|MANGUEIRA) ' then 'arrefecimento'
    when s ~ ' (VELA|VELAS|BOBINA|INJETOR|BICO|BORBOLETA|TBI|LAMBDA|SONDA|COMBUSTIVEL|IGNICAO|SENSOR|MARCHA LENTA|IAC) ' then 'ignicao_injecao'
    when s ~ ' (BATERIA|LAMPADA|FAROL|LANTERNA|ALTERNADOR|PARTIDA|ARRANQUE|FUSIVEL|RELE|INTERRUPTOR|BUZINA|CHICOTE|REGULADOR) ' then 'eletrica'
    when s ~ ' (ESCAPAMENTO|ESCAPE|SILENCIOSO|CATALISADOR|ABAFADOR|PONTEIRA) '                      then 'escapamento'
    when s ~ ' (CORREIA|TENSOR|JUNTA|RETENTOR|PISTAO|ANEL|ANEIS|BRONZINA|VALVULA|COMANDO|CABECOTE|COXIM|POLIA|TUCHO|BIELA|CARTER|VIRABREQUIM|MOTOR|OLEO) ' then 'motor'
    when s ~ ' (PARACHOQUE|PARA CHOQUE|RETROVISOR|MACANETA|FECHADURA|PALHETA|LIMPADOR|VIDRO|PARABRISA|PARA BRISA|GRADE|PARALAMA|CAPO|BORRACHA|FRISO|TAPETE) ' then 'carroceria'
    else 'outros'
  end from n;
$$;

-- 3) Peças que o agente procura em cada tipo de serviço
create or replace function orc_part_cats_for_service(p_category text) returns text[]
language sql immutable as $$
  select case orc_norm(coalesce(p_category, ''))
    when 'pneus'                    then array['rodas', 'outros']
    when 'geometria'                then array['rodas', 'suspensao', 'cubo', 'rolamento', 'outros']
    when 'freios'                   then array['freios', 'cubo', 'rolamento', 'outros']
    when 'troca de oleo e filtros'  then array['oleos_filtros', 'outros']
    when 'motor'                    then array['motor', 'oleos_filtros', 'arrefecimento', 'ignicao_injecao', 'eletrica', 'outros']
    when 'injecao eletronica'       then array['ignicao_injecao', 'eletrica', 'motor', 'outros']
    when 'suspensao'                then array['suspensao', 'cubo', 'rolamento', 'rodas', 'outros']
    when 'direcao'                  then array['suspensao', 'outros']
    when 'transmissao'              then array['transmissao', 'rolamento', 'outros']
    when 'arrefecimento'            then array['arrefecimento', 'motor', 'outros']
    when 'eletrica'                 then array['eletrica', 'ignicao_injecao', 'outros']
    when 'escapamento'              then array['escapamento', 'outros']
    when 'ar-condicionado'          then array['ar_condicionado', 'eletrica', 'outros']
    when 'ar condicionado'          then array['ar_condicionado', 'eletrica', 'outros']
    else null
  end
$$;

-- 4) Agentes que cadastram/editam peça aceitam as categorias novas
do $$
declare r record; d text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('orc_parts_create', 'orc_parts_edit') loop
    d := pg_get_functiondef(r.oid);
    if position('''rodas'',''cubo''' in d) = 0 then
      d := replace(d, '''transmissao'',''rodas'',''escapamento''', '''transmissao'',''rodas'',''cubo'',''rolamento'',''escapamento''');
      execute d;
    end if;
  end loop;
end $$;
