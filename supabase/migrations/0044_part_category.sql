-- Categoria geral da peça (freios, suspensão, motor…) para filtrar o estoque e a busca.
-- Lista fixa (a mesma de src/lib/parts.ts → PART_CATEGORIES). Peça salva sem categoria
-- ganha uma pelo nome (guess_part_category) — vale para cadastro, nota de compra e OS.

create or replace function public.guess_part_category(p_name text)
returns text language sql immutable as $$
  with n as (
    select ' ' || regexp_replace(
      translate(upper(coalesce(p_name, '')), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'),
      '[^A-Z0-9]+', ' ', 'g') || ' ' as s
  )
  select case
    -- a ordem importa: a primeira regra que bate decide
    when s ~ ' (FILTRO|LUBRIFICANTE|GRAXA|ATF) ' or s ~ '^ OLEO ' or s ~ ' OLEO [0-9]'            then 'oleos_filtros'
    when s ~ ' (EMBREAGEM|PLATO|COLAR|CAMBIO|SEMI ?EIXO|HOMOCINETICA|TRIZETA|TULIPA|COIFA|SINCRONIZADO) ' then 'transmissao'
    when s ~ ' (FREIO|FR|PASTILHA|SAPATA|LONA|TAMBOR|PINCA|CILINDRO MESTRE|CILINDRO RODA|SERVO FREIO|FLEXIVEL FREIO) ' then 'freios'
    when s ~ ' (PNEU|CUBO|ROLAMENTO|RODA|CALOTA|CAMARA) '                                           then 'rodas'
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

alter table public.workshop_parts add column if not exists category text;

alter table public.workshop_parts drop constraint if exists workshop_parts_category_chk;
alter table public.workshop_parts add constraint workshop_parts_category_chk check (category in (
  'freios','suspensao','motor','ignicao_injecao','eletrica','oleos_filtros','arrefecimento',
  'transmissao','rodas','escapamento','ar_condicionado','carroceria','outros'));

create or replace function public.workshop_parts_fill_category()
returns trigger language plpgsql as $$
begin
  if new.category is null then new.category := public.guess_part_category(new.name); end if;
  return new;
end $$;

drop trigger if exists trg_workshop_parts_category on public.workshop_parts;
create trigger trg_workshop_parts_category before insert or update on public.workshop_parts
  for each row execute function public.workshop_parts_fill_category();

-- peças que já existem
update public.workshop_parts set category = public.guess_part_category(name) where category is null;

alter table public.workshop_parts alter column category set not null;
create index if not exists workshop_parts_category_idx on public.workshop_parts (workshop_id, category);
