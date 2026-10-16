-- Reabrir/cancelar OS devolve ao estoque só o que essa OS de fato baixou.
-- Nota importada já nasce concluída (insert não dispara o gatilho), então nunca baixou
-- estoque; antes o cancelamento "devolvia" peças que nunca tinham saído.
create or replace function public.trg_os_stock()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare _it record; _sign int; _label text;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then _sign := -1;
  elsif old.status = 'completed' and new.status is distinct from 'completed' then _sign := 1;
  else return new;
  end if;
  _label := 'OS nº ' || coalesce(lpad(new.number::text, 4, '0'), left(new.id::text, 8));

  if _sign < 0 then
    for _it in
      select part_id, sum(quantity) qty from service_order_items
       where service_order_id = new.id and kind = 'part' and part_id is not null
       group by part_id
    loop
      update workshop_parts set stock_qty = stock_qty - _it.qty where id = _it.part_id;
      insert into stock_movements (workshop_id, part_id, qty, kind, service_order_id, note)
      values (new.workshop_id, _it.part_id, -_it.qty, 'os', new.id, _label);
    end loop;
  else
    -- Saldo baixado por esta OS (baixas menos estornos anteriores)
    for _it in
      select part_id, -sum(qty) qty from stock_movements
       where service_order_id = new.id and kind in ('os', 'estorno_os')
       group by part_id
      having -sum(qty) > 0
    loop
      update workshop_parts set stock_qty = stock_qty + _it.qty where id = _it.part_id;
      insert into stock_movements (workshop_id, part_id, qty, kind, service_order_id, note)
      values (new.workshop_id, _it.part_id, _it.qty, 'estorno_os', new.id, _label || ' reaberta');
    end loop;
  end if;
  return new;
end;
$function$;
