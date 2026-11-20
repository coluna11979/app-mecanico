-- "Rodas e pneus" agora é só "Pneus" (cubos e rolamentos ganharam categoria própria).
-- 1) Pneus cadastrados em outra categoria (medida tipo 205/70R15 ou a palavra PNEU) vão para Pneus
update workshop_parts set category = 'rodas'
 where category <> 'rodas' and name ~* '(\mpneus?\M|\m[0-9]{3}/[0-9]{2}\s*z?r\s*[0-9]{2})';

-- 2) Classificação automática: medida de pneu vem antes de tudo ("205/70R15 8 LONAS" não é lona de freio)
create or replace function guess_part_category(p_name text) returns text
language sql immutable as $$
  with n as (
    select ' ' || regexp_replace(
      translate(upper(coalesce(p_name, '')), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'),
      '[^A-Z0-9]+', ' ', 'g') || ' ' as s
  )
  select case
    when s ~ ' PNEUS? ' or s ~ ' [0-9]{3} [0-9]{2} ?Z?R ?[0-9]{2}'                                 then 'rodas'
    when s ~ ' (FILTRO|LUBRIFICANTE|GRAXA|ATF) ' or s ~ '^ OLEO ' or s ~ ' OLEO [0-9]'            then 'oleos_filtros'
    when s ~ ' (EMBREAGEM|PLATO|COLAR|CAMBIO|SEMI ?EIXO|HOMOCINETICA|TRIZETA|TULIPA|COIFA|SINCRONIZADO) ' then 'transmissao'
    when s ~ ' (FREIO|FR|PASTILHA|SAPATA|LONA|TAMBOR|PINCA|CILINDRO MESTRE|CILINDRO RODA|SERVO FREIO|FLEXIVEL FREIO) ' then 'freios'
    when s ~ ' CUBOS? '                                                                            then 'cubo'
    when s ~ ' ROLAMENTOS? '                                                                       then 'rolamento'
    when s ~ ' (RODA|CALOTA|CAMARA) '                                                              then 'rodas'
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
