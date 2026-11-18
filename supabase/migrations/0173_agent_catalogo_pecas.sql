-- Agente (Orçamentista): organizar o cadastro de peças da oficina.
--  · orc_parts_overview   : fotografia do cadastro (outros, sem marca, sem veículo, duplicadas...)
--  · orc_parts_list       : lista peças por problema (paginada) com os veículos já vinculados
--  · orc_parts_edit       : corrige categoria/marca/nome/código/universal e VINCULA veículos (marca, modelo, anos) em lote
--  · orc_parts_duplicates : grupos de peças repetidas (mesmo nome+marca, ou mesmo código+marca)
--  · orc_parts_merge      : une duplicadas: passa OS, compras, estoque (histórico), kits e veículos para a que fica e
--                           DESATIVA as outras (nada é apagado)
-- Só o service_role executa; a oficina vem do servidor.

create or replace function public.orc_parts_overview(p_workshop uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r jsonb;
begin
  select jsonb_build_object('ok', true,
    'ativas',            count(*) filter (where p.active),
    'inativas',          count(*) filter (where not p.active),
    'categoria_outros',  count(*) filter (where p.active and p.category = 'outros'),
    'sem_marca',         count(*) filter (where p.active and btrim(coalesce(p.brand, '')) = ''),
    'sem_codigo',        count(*) filter (where p.active and btrim(coalesce(p.code, '')) = ''),
    'sem_veiculo',       count(*) filter (where p.active and not p.universal and not exists (select 1 from workshop_part_vehicles v where v.part_id = p.id)),
    'universais',        count(*) filter (where p.active and p.universal),
    'por_categoria',     (select coalesce(jsonb_object_agg(c, n), '{}'::jsonb) from (select category c, count(*) n from workshop_parts where workshop_id = p_workshop and active group by 1) t)
  ) into r from workshop_parts p where p.workshop_id = p_workshop;
  r := r || jsonb_build_object(
    'grupos_duplicados_nome', (select count(*) from (
        select 1 from workshop_parts where workshop_id = p_workshop and active
         group by btrim(orc_norm(name)), lower(btrim(coalesce(brand, ''))) having count(*) > 1) g),
    'grupos_duplicados_codigo', (select count(*) from (
        select 1 from workshop_parts where workshop_id = p_workshop and active and regexp_replace(lower(coalesce(code, '')), '[^a-z0-9]', '', 'g') <> ''
         group by regexp_replace(lower(code), '[^a-z0-9]', '', 'g'), lower(btrim(coalesce(brand, ''))) having count(*) > 1) g));
  return r;
end $$;

create or replace function public.orc_parts_list(
  p_workshop uuid, p_problema text default null, p_categoria text default null, p_busca text default null,
  p_limit integer default 30, p_offset integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lim integer := least(greatest(coalesce(p_limit, 30), 1), 40);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_q   text := btrim(orc_norm(coalesce(p_busca, '')));
  v_total integer;
  v_rows  jsonb;
begin
  create temp table if not exists _orc_pl (id uuid) on commit drop;
  truncate _orc_pl;
  insert into _orc_pl
  select p.id from workshop_parts p
   where p.workshop_id = p_workshop and p.active
     and (p_categoria is null or p.category = p_categoria)
     and (v_q = '' or orc_norm(concat_ws(' ', p.name, p.brand, p.code)) like '%' || v_q || '%')
     and case coalesce(p_problema, '')
           when 'outros'      then p.category = 'outros'
           when 'sem_marca'   then btrim(coalesce(p.brand, '')) = ''
           when 'sem_codigo'  then btrim(coalesce(p.code, '')) = ''
           when 'sem_veiculo' then not p.universal and not exists (select 1 from workshop_part_vehicles v where v.part_id = p.id)
           else true end;
  select count(*) into v_total from _orc_pl;

  select coalesce(jsonb_agg(jsonb_build_object(
           'peca_id', x.id, 'nome', x.name, 'marca', x.brand, 'codigo', x.code, 'categoria', x.category,
           'custo', x.cost, 'estoque', x.stock_qty, 'universal', x.universal,
           'veiculos', (select coalesce(jsonb_agg(v.brand || ' ' || v.model || case when v.year_from is null and v.year_to is null then '' else ' ' || coalesce(v.year_from::text, '') || '-' || coalesce(v.year_to::text, '') end), '[]'::jsonb)
                          from (select * from workshop_part_vehicles where part_id = x.id order by brand, model limit 5) v)
         ) order by x.name), '[]'::jsonb)
    into v_rows
    from (select p.* from workshop_parts p join _orc_pl l on l.id = p.id order by p.name limit v_lim offset v_off) x;

  return jsonb_build_object('ok', true, 'total', v_total, 'mostrando', jsonb_array_length(v_rows), 'proximo_offset', v_off + v_lim, 'pecas', v_rows);
end $$;

create or replace function public.orc_parts_edit(p_workshop uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it      jsonb;
  v_id    uuid;
  v_cat   text;
  v_ok    integer := 0;
  v_res   jsonb := '[]'::jsonb;
  v_vei   jsonb;
  vv      jsonb;
  v_brand text;
  v_model text;
  v_from  integer;
  v_to    integer;
  v_cats  text[] := array['freios','suspensao','motor','ignicao_injecao','eletrica','oleos_filtros','arrefecimento','transmissao','rodas','escapamento','ar_condicionado','carroceria','outros'];
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then return jsonb_build_object('ok', false, 'error', 'lista_vazia'); end if;
  if jsonb_array_length(p_items) > 50 then return jsonb_build_object('ok', false, 'error', 'maximo_50_por_vez'); end if;

  for it in select * from jsonb_array_elements(p_items) loop
    begin
      v_id := nullif(it->>'peca_id', '')::uuid;
    exception when others then v_id := null; end;
    if v_id is null or not exists (select 1 from workshop_parts where id = v_id and workshop_id = p_workshop) then
      v_res := v_res || jsonb_build_object('peca_id', it->>'peca_id', 'ok', false, 'error', 'peca_nao_encontrada');
      continue;
    end if;
    v_cat := nullif(btrim(it->>'categoria'), '');
    if v_cat is not null and not (v_cat = any (v_cats)) then
      v_res := v_res || jsonb_build_object('peca_id', v_id, 'ok', false, 'error', 'categoria_invalida', 'validas', to_jsonb(v_cats));
      continue;
    end if;

    update workshop_parts set
      category  = coalesce(v_cat, category),
      brand     = case when nullif(btrim(it->>'marca'), '') is not null then left(btrim(it->>'marca'), 60) else brand end,
      name      = case when length(btrim(coalesce(it->>'nome', ''))) >= 2 then left(btrim(it->>'nome'), 160) else name end,
      code      = case when nullif(btrim(it->>'codigo'), '') is not null then left(btrim(it->>'codigo'), 60) else code end,
      universal = case when it ? 'universal' and jsonb_typeof(it->'universal') = 'boolean' then (it->>'universal')::boolean else universal end
     where id = v_id;

    v_vei := it->'veiculos';
    if jsonb_typeof(v_vei) = 'array' then
      if (it->>'substituir_veiculos') = 'true' then delete from workshop_part_vehicles where part_id = v_id; end if;
      for vv in select * from jsonb_array_elements(v_vei) loop
        v_brand := left(btrim(coalesce(vv->>'marca', '')), 60);
        v_model := left(btrim(coalesce(vv->>'modelo', '')), 60);
        if v_brand = '' then continue; end if;
        if v_model = '' then v_model := 'Todos os modelos'; end if;
        v_from := nullif(vv->>'ano_de', '')::integer;
        v_to   := nullif(vv->>'ano_ate', '')::integer;
        if not exists (select 1 from workshop_part_vehicles w
                        where w.part_id = v_id and lower(w.brand) = lower(v_brand) and lower(w.model) = lower(v_model)
                          and w.year_from is not distinct from v_from and w.year_to is not distinct from v_to) then
          insert into workshop_part_vehicles (workshop_id, part_id, brand, model, year_from, year_to)
          values (p_workshop, v_id, v_brand, v_model, v_from, v_to);
        end if;
      end loop;
    end if;
    v_ok := v_ok + 1;
    v_res := v_res || jsonb_build_object('peca_id', v_id, 'ok', true);
  end loop;
  return jsonb_build_object('ok', true, 'alteradas', v_ok, 'resultado', v_res);
end $$;

create or replace function public.orc_parts_duplicates(p_workshop uuid, p_limit integer default 15, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lim integer := least(greatest(coalesce(p_limit, 15), 1), 25);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_groups jsonb;
  v_total integer;
begin
  create temp table if not exists _orc_dup (gkey text, motivo text, pid uuid) on commit drop;
  truncate _orc_dup;
  insert into _orc_dup
  select 'n|' || btrim(orc_norm(name)) || '|' || lower(btrim(coalesce(brand, ''))), 'mesmo nome e marca', id
    from workshop_parts where workshop_id = p_workshop and active and btrim(orc_norm(name)) <> '';
  delete from _orc_dup d where d.motivo = 'mesmo nome e marca' and (select count(*) from _orc_dup e where e.gkey = d.gkey) < 2;
  -- grupos por código; não repete o que já saiu como grupo de nome (mesmos integrantes)
  create temp table if not exists _orc_dupc (gkey text, pid uuid) on commit drop;
  truncate _orc_dupc;
  insert into _orc_dupc
  select 'c|' || regexp_replace(lower(code), '[^a-z0-9]', '', 'g') || '|' || lower(btrim(coalesce(brand, ''))), id
    from workshop_parts where workshop_id = p_workshop and active and regexp_replace(lower(coalesce(code, '')), '[^a-z0-9]', '', 'g') <> '';
  insert into _orc_dup
  select c.gkey, 'mesmo código e marca', c.pid from _orc_dupc c
   where c.gkey in (
     select c2.gkey from _orc_dupc c2 left join _orc_dup n on n.pid = c2.pid
      group by c2.gkey
     having count(*) >= 2 and not (count(n.gkey) = count(*) and count(distinct n.gkey) = 1));

  select count(distinct gkey) into v_total from _orc_dup;
  select coalesce(jsonb_agg(g order by g->>'nome'), '[]'::jsonb) into v_groups from (
    select jsonb_build_object('motivo', min(d.motivo), 'nome', min(p.name),
      'pecas', jsonb_agg(jsonb_build_object(
          'peca_id', p.id, 'nome', p.name, 'marca', p.brand, 'codigo', p.code, 'categoria', p.category,
          'custo', p.cost, 'estoque', p.stock_qty,
          'usos', (select count(*) from service_order_items i where i.part_id = p.id)
                + (select count(*) from purchase_items i where i.part_id = p.id)
                + (select count(*) from workshop_service_parts i where i.part_id = p.id),
          'veiculos', (select count(*) from workshop_part_vehicles v where v.part_id = p.id)) order by p.created_at)) g
      from _orc_dup d join workshop_parts p on p.id = d.pid
     group by d.gkey order by min(p.name) limit v_lim offset v_off) t;
  return jsonb_build_object('ok', true, 'total_grupos', v_total, 'proximo_offset', v_off + v_lim, 'grupos', v_groups);
end $$;

create or replace function public.orc_parts_merge(p_workshop uuid, p_groups jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g        jsonb;
  v_keep   uuid;
  v_rm     uuid;
  v_rm_arr jsonb;
  v_sum    boolean;
  v_res    jsonb := '[]'::jsonb;
  v_n      integer := 0;
begin
  if jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then return jsonb_build_object('ok', false, 'error', 'lista_vazia'); end if;
  if jsonb_array_length(p_groups) > 25 then return jsonb_build_object('ok', false, 'error', 'maximo_25_grupos'); end if;

  for g in select * from jsonb_array_elements(p_groups) loop
    begin v_keep := nullif(g->>'manter', '')::uuid; exception when others then v_keep := null; end;
    v_rm_arr := coalesce(g->'remover', '[]'::jsonb);
    v_sum := coalesce((g->>'somar_estoque')::boolean, false);
    if v_keep is null or jsonb_typeof(v_rm_arr) <> 'array' or jsonb_array_length(v_rm_arr) = 0
       or not exists (select 1 from workshop_parts where id = v_keep and workshop_id = p_workshop and active) then
      v_res := v_res || jsonb_build_object('manter', g->>'manter', 'ok', false, 'error', 'grupo_invalido');
      continue;
    end if;
    for v_rm in select (x)::uuid from jsonb_array_elements_text(v_rm_arr) x loop
      if v_rm = v_keep or not exists (select 1 from workshop_parts where id = v_rm and workshop_id = p_workshop and active) then continue; end if;

      update service_order_items   set part_id = v_keep where part_id = v_rm and service_order_id in (select id from service_orders where workshop_id = p_workshop);
      update purchase_items        set part_id = v_keep where part_id = v_rm;
      update stock_movements       set part_id = v_keep where part_id = v_rm;
      update checkup_items         set quote_part_id = v_keep where quote_part_id = v_rm;
      update workshop_service_parts set part_id = v_keep where part_id = v_rm and workshop_id = p_workshop;

      -- veículos: leva os que a que fica ainda não tem
      insert into workshop_part_vehicles (workshop_id, part_id, brand, model, year_from, year_to)
      select r.workshop_id, v_keep, r.brand, r.model, r.year_from, r.year_to
        from workshop_part_vehicles r
       where r.part_id = v_rm
         and not exists (select 1 from workshop_part_vehicles k where k.part_id = v_keep and lower(k.brand) = lower(r.brand) and lower(k.model) = lower(r.model)
                           and k.year_from is not distinct from r.year_from and k.year_to is not distinct from r.year_to);
      delete from workshop_part_vehicles where part_id = v_rm;

      -- completa o que falta na que fica
      update workshop_parts k set
        brand = case when btrim(coalesce(k.brand, '')) = '' then r.brand else k.brand end,
        code  = case when btrim(coalesce(k.code, '')) = '' then r.code else k.code end,
        stock_qty = case when v_sum then k.stock_qty + coalesce(r.stock_qty, 0) else k.stock_qty end
       from workshop_parts r where k.id = v_keep and r.id = v_rm;

      update workshop_parts set active = false, stock_qty = case when v_sum then 0 else stock_qty end where id = v_rm;
      v_n := v_n + 1;
    end loop;
    v_res := v_res || jsonb_build_object('manter', v_keep, 'ok', true);
  end loop;
  return jsonb_build_object('ok', true, 'unidas', v_n, 'resultado', v_res);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'orc_parts_overview(uuid)', 'orc_parts_list(uuid,text,text,text,integer,integer)', 'orc_parts_edit(uuid,jsonb)',
    'orc_parts_duplicates(uuid,integer,integer)', 'orc_parts_merge(uuid,jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
