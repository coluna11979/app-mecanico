-- Orçamentista: marcar "Cliente trouxe a peça" na OS (orc_os_update ganha p_cliente_trouxe). Serviço que leva peça
-- sem peça só conclui assim (trava da 0189), e a comissão dele vira a de mão de obra.

drop function if exists public.orc_os_update(uuid, uuid, integer, text, text, text, integer, numeric, numeric);
create or replace function public.orc_os_update(
  p_workshop uuid, p_user uuid, p_os_number integer,
  p_titulo text default null, p_descricao text default null, p_obs text default null,
  p_km integer default null, p_horas numeric default null, p_desconto numeric default null,
  p_cliente_trouxe boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os    service_orders%rowtype;
  v_items numeric;
begin
  if not orc_is_manager(p_workshop, p_user) then return jsonb_build_object('ok', false, 'error', 'so_gestor'); end if;
  select * into v_os from service_orders where workshop_id = p_workshop and number = p_os_number order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'os_nao_encontrada'); end if;
  if v_os.status in ('completed', 'cancelled') then return jsonb_build_object('ok', false, 'error', 'os_fechada', 'detalhe', 'Concluída: reabra com orc_reabrir_os.'); end if;
  if p_titulo is null and p_descricao is null and p_obs is null and p_km is null and p_horas is null and p_desconto is null and p_cliente_trouxe is null then
    return jsonb_build_object('ok', false, 'error', 'nada_para_alterar');
  end if;
  if p_titulo is not null and length(btrim(p_titulo)) < 2 then return jsonb_build_object('ok', false, 'error', 'titulo_curto'); end if;
  if p_km is not null and (p_km < 0 or p_km > 3000000) then return jsonb_build_object('ok', false, 'error', 'km_invalido'); end if;
  if p_horas is not null and (p_horas < 0 or p_horas > 500) then return jsonb_build_object('ok', false, 'error', 'horas_invalidas'); end if;
  if p_desconto is not null then
    select coalesce(sum(quantity * unit_price), 0) into v_items from service_order_items where service_order_id = v_os.id;
    if p_desconto < 0 or p_desconto > v_items then
      return jsonb_build_object('ok', false, 'error', 'desconto_invalido', 'total_itens', v_items);
    end if;
  end if;

  update service_orders set
    title       = coalesce(nullif(left(btrim(p_titulo), 200), ''), title),
    description = case when p_descricao is null then description else nullif(left(btrim(p_descricao), 4000), '') end,
    notes       = case when p_obs is null then notes else nullif(left(btrim(p_obs), 4000), '') end,
    km_reading  = coalesce(p_km, km_reading),
    estimated_hours = coalesce(p_horas, estimated_hours),
    discount    = coalesce(p_desconto, discount),
    customer_brought_parts = coalesce(p_cliente_trouxe, customer_brought_parts)
   where id = v_os.id;  -- o gatilho recalcula o total quando muda o desconto

  select * into v_os from service_orders where id = v_os.id;
  return jsonb_build_object('ok', true, 'os_numero', v_os.number, 'titulo', v_os.title, 'reclamacao', v_os.description,
    'observacoes', v_os.notes, 'km', v_os.km_reading, 'horas_estimadas', v_os.estimated_hours,
    'desconto', v_os.discount, 'cliente_trouxe_peca', v_os.customer_brought_parts, 'total_os', v_os.price, 'em_aberto', round(v_os.price - v_os.counter_discount - v_os.paid_amount, 2));
end $$;
revoke all on function public.orc_os_update(uuid, uuid, integer, text, text, text, integer, numeric, numeric, boolean) from public, anon, authenticated;
grant execute on function public.orc_os_update(uuid, uuid, integer, text, text, text, integer, numeric, numeric, boolean) to service_role;
