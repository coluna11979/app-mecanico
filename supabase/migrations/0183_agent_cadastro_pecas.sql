-- Orçamentista: CADASTRAR peça nova e corrigir também custo, preço de venda, unidade, estoque mínimo e a
-- contagem do estoque (o que a tela "Editar peça" faz). Antes ele só mexia em nome/categoria/marca/código.
-- Mesmas regras da tela: categoria válida, custo > 0 (regra do agente: peça sem custo não existe),
-- preço de venda fixo OU volta para a margem; mudança de estoque vira movimento "ajuste" no histórico.
-- Não duplica: se já existe peça ativa com o mesmo nome+marca ou código+marca, devolve a que existe.

create or replace function public.orc_parts_create(p_workshop uuid, p_items jsonb, p_user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it      jsonb;
  vv      jsonb;
  v_id    uuid;
  v_name  text;
  v_brand text;
  v_code  text;
  v_cat   text;
  v_unit  text;
  v_cost  numeric;
  v_sale  numeric;
  v_min   numeric;
  v_stock numeric;
  v_dup   record;
  v_vb    text;
  v_vm    text;
  v_ok    integer := 0;
  v_res   jsonb := '[]'::jsonb;
  v_cats  text[] := array['freios','suspensao','motor','ignicao_injecao','eletrica','oleos_filtros','arrefecimento','transmissao','rodas','escapamento','ar_condicionado','carroceria','outros'];
  v_units text[] := array['un','litro','kit','jogo'];
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then return jsonb_build_object('ok', false, 'error', 'lista_vazia'); end if;
  if jsonb_array_length(p_items) > 30 then return jsonb_build_object('ok', false, 'error', 'maximo_30_por_vez'); end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_name  := left(btrim(coalesce(it->>'nome', '')), 160);
    v_brand := nullif(left(btrim(coalesce(it->>'marca', '')), 60), '');
    v_code  := nullif(left(btrim(coalesce(it->>'codigo', '')), 60), '');
    v_cat   := nullif(btrim(coalesce(it->>'categoria', '')), '');
    v_unit  := coalesce(nullif(btrim(lower(coalesce(it->>'unidade', ''))), ''), 'un');
    begin
      v_cost  := nullif(it->>'custo', '')::numeric;
      v_sale  := nullif(it->>'preco_venda', '')::numeric;
      v_min   := coalesce(nullif(it->>'estoque_minimo', '')::numeric, 0);
      v_stock := coalesce(nullif(it->>'estoque', '')::numeric, 0);
    exception when others then
      v_res := v_res || jsonb_build_object('nome', v_name, 'ok', false, 'error', 'numero_invalido');
      continue;
    end;

    if length(v_name) < 2 then v_res := v_res || jsonb_build_object('nome', v_name, 'ok', false, 'error', 'nome_obrigatorio'); continue; end if;
    if v_cat is null or not (v_cat = any (v_cats)) then
      v_res := v_res || jsonb_build_object('nome', v_name, 'ok', false, 'error', 'categoria_obrigatoria', 'validas', to_jsonb(v_cats)); continue;
    end if;
    if not (v_unit = any (v_units)) then
      v_res := v_res || jsonb_build_object('nome', v_name, 'ok', false, 'error', 'unidade_invalida', 'validas', to_jsonb(v_units)); continue;
    end if;
    if v_cost is null or v_cost <= 0 then v_res := v_res || jsonb_build_object('nome', v_name, 'ok', false, 'error', 'custo_obrigatorio'); continue; end if;
    if v_sale is not null and v_sale < 0 or v_min < 0 or v_stock < 0 then
      v_res := v_res || jsonb_build_object('nome', v_name, 'ok', false, 'error', 'numero_invalido'); continue;
    end if;

    -- Já existe? (mesmo nome+marca, ou mesmo código+marca, entre as ativas)
    if coalesce((it->>'forcar_novo')::boolean, false) = false then
      select p.id, p.name, p.brand, p.code, p.category, p.cost into v_dup
        from workshop_parts p
       where p.workshop_id = p_workshop and p.active
         and lower(coalesce(p.brand, '')) = lower(coalesce(v_brand, ''))
         and (orc_norm(p.name) = orc_norm(v_name) or (v_code is not null and lower(p.code) = lower(v_code)))
       limit 1;
      if v_dup.id is not null then
        v_res := v_res || jsonb_build_object('nome', v_name, 'ok', false, 'error', 'ja_existe',
          'existente', jsonb_build_object('peca_id', v_dup.id, 'nome', v_dup.name, 'marca', v_dup.brand, 'codigo', v_dup.code, 'categoria', v_dup.category, 'custo', v_dup.cost));
        continue;
      end if;
    end if;

    insert into workshop_parts (workshop_id, name, brand, code, unit, category, cost, sale_price, min_qty, universal, active)
    values (p_workshop, v_name, v_brand, v_code, v_unit, v_cat, v_cost, v_sale, v_min,
            coalesce((it->>'universal')::boolean, false), true)
    returning id into v_id;

    if v_stock > 0 then
      insert into stock_movements (workshop_id, part_id, qty, kind, note, created_by)
      values (p_workshop, v_id, v_stock, 'ajuste', 'Estoque inicial (Orçamentista)', p_user);
      update workshop_parts set stock_qty = v_stock where id = v_id;
    end if;

    if jsonb_typeof(it->'veiculos') = 'array' then
      for vv in select * from jsonb_array_elements(it->'veiculos') loop
        v_vb := left(btrim(coalesce(vv->>'marca', '')), 60);
        v_vm := coalesce(nullif(left(btrim(coalesce(vv->>'modelo', '')), 60), ''), 'Todos os modelos');
        if v_vb = '' then continue; end if;
        insert into workshop_part_vehicles (workshop_id, part_id, brand, model, year_from, year_to)
        values (p_workshop, v_id, v_vb, v_vm, nullif(vv->>'ano_de', '')::integer, nullif(vv->>'ano_ate', '')::integer);
      end loop;
    end if;

    v_ok := v_ok + 1;
    v_res := v_res || jsonb_build_object('nome', v_name, 'ok', true, 'peca_id', v_id, 'categoria', v_cat, 'custo', v_cost,
                                         'preco_venda', v_sale, 'estoque', v_stock, 'unidade', v_unit);
  end loop;
  return jsonb_build_object('ok', v_ok > 0, 'cadastradas', v_ok, 'resultado', v_res);
end $$;
revoke all on function public.orc_parts_create(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.orc_parts_create(uuid, jsonb, uuid) to service_role;

-- orc_parts_edit ganha custo, preço de venda (ou volta à margem), unidade, estoque mínimo e contagem de estoque
drop function if exists public.orc_parts_edit(uuid, jsonb);
create or replace function public.orc_parts_edit(p_workshop uuid, p_items jsonb, p_user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it      jsonb;
  v_id    uuid;
  v_cat   text;
  v_unit  text;
  v_cost  numeric;
  v_sale  numeric;
  v_min   numeric;
  v_stock numeric;
  v_cur   numeric;
  v_ok    integer := 0;
  v_res   jsonb := '[]'::jsonb;
  v_vei   jsonb;
  vv      jsonb;
  v_brand text;
  v_model text;
  v_from  integer;
  v_to    integer;
  v_cats  text[] := array['freios','suspensao','motor','ignicao_injecao','eletrica','oleos_filtros','arrefecimento','transmissao','rodas','escapamento','ar_condicionado','carroceria','outros'];
  v_units text[] := array['un','litro','kit','jogo'];
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
    v_unit := nullif(btrim(lower(coalesce(it->>'unidade', ''))), '');
    if v_unit is not null and not (v_unit = any (v_units)) then
      v_res := v_res || jsonb_build_object('peca_id', v_id, 'ok', false, 'error', 'unidade_invalida', 'validas', to_jsonb(v_units));
      continue;
    end if;
    begin
      v_cost  := nullif(it->>'custo', '')::numeric;
      v_sale  := nullif(it->>'preco_venda', '')::numeric;
      v_min   := nullif(it->>'estoque_minimo', '')::numeric;
      v_stock := nullif(it->>'estoque', '')::numeric;
    exception when others then
      v_res := v_res || jsonb_build_object('peca_id', v_id, 'ok', false, 'error', 'numero_invalido');
      continue;
    end;
    if v_cost is not null and v_cost <= 0 then
      v_res := v_res || jsonb_build_object('peca_id', v_id, 'ok', false, 'error', 'custo_deve_ser_maior_que_zero'); continue;
    end if;
    if (v_sale is not null and v_sale < 0) or (v_min is not null and v_min < 0) or (v_stock is not null and v_stock < 0) then
      v_res := v_res || jsonb_build_object('peca_id', v_id, 'ok', false, 'error', 'numero_invalido'); continue;
    end if;

    update workshop_parts set
      category   = coalesce(v_cat, category),
      brand      = case when nullif(btrim(it->>'marca'), '') is not null then left(btrim(it->>'marca'), 60) else brand end,
      name       = case when length(btrim(coalesce(it->>'nome', ''))) >= 2 then left(btrim(it->>'nome'), 160) else name end,
      code       = case when nullif(btrim(it->>'codigo'), '') is not null then left(btrim(it->>'codigo'), 60) else code end,
      universal  = case when it ? 'universal' and jsonb_typeof(it->'universal') = 'boolean' then (it->>'universal')::boolean else universal end,
      unit       = coalesce(v_unit, unit),
      cost       = coalesce(v_cost, cost),
      min_qty    = coalesce(v_min, min_qty),
      sale_price = case when (it->>'usar_margem') = 'true' then null when v_sale is not null then v_sale else sale_price end,
      margin_percent = case when v_sale is not null and (it->>'usar_margem') is distinct from 'true' then null else margin_percent end
     where id = v_id;

    -- Contagem de estoque: vira ajuste no histórico (igual à tela)
    if v_stock is not null then
      select stock_qty into v_cur from workshop_parts where id = v_id for update;
      if abs(v_stock - v_cur) > 0.0005 then
        insert into stock_movements (workshop_id, part_id, qty, kind, note, created_by)
        values (p_workshop, v_id, v_stock - v_cur, 'ajuste', 'Contagem de estoque (Orçamentista)', p_user);
        update workshop_parts set stock_qty = v_stock where id = v_id;
      end if;
    end if;

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
    v_res := v_res || (select jsonb_build_object('peca_id', p.id, 'ok', true, 'nome', p.name, 'marca', p.brand, 'categoria', p.category,
                         'custo', p.cost, 'preco_venda', p.sale_price, 'unidade', p.unit, 'estoque', p.stock_qty, 'estoque_minimo', p.min_qty)
                         from workshop_parts p where p.id = v_id);
  end loop;
  return jsonb_build_object('ok', true, 'alteradas', v_ok, 'resultado', v_res);
end $$;
revoke all on function public.orc_parts_edit(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.orc_parts_edit(uuid, jsonb, uuid) to service_role;

-- Liga a ferramenta nova nos Orçamentistas que já existem
update ai_agents set tools = array_append(tools, 'orc_pecas_cadastrar')
 where template = 'orcamento' and not ('orc_pecas_cadastrar' = any (tools));
