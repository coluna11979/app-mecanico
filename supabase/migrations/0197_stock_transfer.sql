-- Transferência de peças entre lojas do mesmo dono (Jota Car ↔ JC Pneus).
-- Tira do estoque da loja de origem e põe na de destino, achando a peça lá pelo código (ou nome)
-- ou criando uma cópia (categoria, preço, margem e carros). Cada lado deixa um movimento no histórico.

alter table public.stock_movements drop constraint if exists stock_movements_kind_check;
alter table public.stock_movements add constraint stock_movements_kind_check
  check (kind in ('compra', 'estorno_compra', 'os', 'estorno_os', 'ajuste', 'transf_saida', 'transf_entrada'));

create or replace function public.stock_transfer(p_part uuid, p_dest_workshop uuid, p_qty numeric, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _src  workshop_parts;
  _dst  workshop_parts;
  _src_name text;
  _dst_name text;
  _note text := nullif(trim(coalesce(p_note, '')), '');
  _new_cost numeric;
begin
  select * into _src from workshop_parts where id = p_part for update;
  if _src.id is null or not is_workshop_member(_src.workshop_id, auth.uid()) then raise exception 'Peça não encontrada'; end if;
  if p_dest_workshop is null or p_dest_workshop = _src.workshop_id then raise exception 'Escolha outra loja de destino'; end if;
  if not is_workshop_member(p_dest_workshop, auth.uid()) then raise exception 'Você não tem acesso à loja de destino'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantidade inválida'; end if;
  if p_qty > _src.stock_qty then
    raise exception 'Só há % % em estoque. Ajuste o estoque antes de transferir.', _src.stock_qty, _src.unit;
  end if;

  select business_name into _src_name from workshops where id = _src.workshop_id;
  select business_name into _dst_name from workshops where id = p_dest_workshop;

  -- Peça equivalente na loja de destino: mesmo código, senão mesmo nome
  if nullif(trim(coalesce(_src.code, '')), '') is not null then
    select * into _dst from workshop_parts
     where workshop_id = p_dest_workshop and lower(trim(code)) = lower(trim(_src.code))
     order by active desc, created_at limit 1 for update;
  end if;
  if _dst.id is null then
    select * into _dst from workshop_parts
     where workshop_id = p_dest_workshop and lower(trim(name)) = lower(trim(_src.name))
     order by active desc, created_at limit 1 for update;
  end if;

  if _dst.id is null then
    insert into workshop_parts (workshop_id, name, code, brand, unit, supplier, cost, margin_percent, sale_price,
                                active, stock_qty, min_qty, category, subcategory, universal)
    values (p_dest_workshop, _src.name, _src.code, _src.brand, _src.unit, _src.supplier, _src.cost, _src.margin_percent,
            _src.sale_price, true, 0, 0, _src.category, _src.subcategory, _src.universal)
    returning * into _dst;
    insert into workshop_part_vehicles (workshop_id, part_id, brand, model, year_from, year_to)
    select p_dest_workshop, _dst.id, brand, model, year_from, year_to from workshop_part_vehicles where part_id = _src.id;
  else
    -- Custo médio ponderado quando a loja de destino já tinha estoque da peça
    if _dst.stock_qty > 0 and _src.cost > 0 then
      _new_cost := round((_dst.stock_qty * _dst.cost + p_qty * _src.cost) / (_dst.stock_qty + p_qty), 2);
      update workshop_parts set cost = _new_cost, active = true where id = _dst.id;
    elsif _dst.stock_qty <= 0 and _src.cost > 0 then
      update workshop_parts set cost = _src.cost, active = true where id = _dst.id;
    else
      update workshop_parts set active = true where id = _dst.id;
    end if;
    -- Carros: só completa se a peça de lá ainda não tinha nenhum
    if not exists (select 1 from workshop_part_vehicles where part_id = _dst.id) then
      insert into workshop_part_vehicles (workshop_id, part_id, brand, model, year_from, year_to)
      select p_dest_workshop, _dst.id, brand, model, year_from, year_to from workshop_part_vehicles where part_id = _src.id;
    end if;
  end if;

  update workshop_parts set stock_qty = stock_qty - p_qty where id = _src.id;
  update workshop_parts set stock_qty = stock_qty + p_qty where id = _dst.id;

  insert into stock_movements (workshop_id, part_id, qty, kind, note) values
    (_src.workshop_id, _src.id, -p_qty, 'transf_saida',
     'Transferência para ' || coalesce(_dst_name, 'outra loja') || coalesce(': ' || _note, '')),
    (p_dest_workshop, _dst.id, p_qty, 'transf_entrada',
     'Transferência de ' || coalesce(_src_name, 'outra loja') || coalesce(': ' || _note, ''));

  return _dst.id;
end;
$$;

revoke all on function public.stock_transfer(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.stock_transfer(uuid, uuid, numeric, text) to authenticated;
