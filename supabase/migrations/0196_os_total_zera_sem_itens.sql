-- Excluir todos os itens da OS deixava o total antigo gravado (recalc não fazia nada com 0 itens,
-- para preservar OS antigas com valor digitado). Agora: se o último item foi APAGADO, o total zera.
-- OS antiga que nunca teve itens continua com o valor digitado (nenhum item apagado = nenhum gatilho).
create or replace function public.trg_os_items_recalc() returns trigger
language plpgsql set search_path to 'public' as $$
declare v_os uuid := coalesce(new.service_order_id, old.service_order_id);
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.service_order_items where service_order_id = v_os) then
    update public.service_orders set parts_cost = 0, labor_cost = 0, price = 0 where id = v_os;
  else
    perform public.recalc_service_order_totals(v_os);
  end if;
  return null;
end;
$$;
