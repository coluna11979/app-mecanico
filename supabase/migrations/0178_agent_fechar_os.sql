-- Orçamentista: FECHAR a OS (receber no caixa + concluir), só com o "sim" do gestor dado no chat.
-- Faz o mesmo que a tela "Receber OS" + "Concluir": grava o pagamento (os_payments + cash_entries no caixa ABERTO),
-- combina "pagar depois" quando sobrar saldo, e marca a OS como concluída (o gatilho baixa o estoque).
-- Regras de segurança:
--  · só o dono ou um operador com função gestor da oficina (p_user) fecha;
--  · exige TODOS os serviços com responsável da loja (a comissão sai desse vínculo);
--  · p_expected = o valor em aberto que o gestor aprovou: se mudou, não fecha;
--  · recebimento de hoje exige caixa aberto; sem desconto (desconto é pela tela do caixa);
--  · só o service_role executa.

create or replace function public.orc_close_os(
  p_workshop uuid, p_user uuid, p_os_number integer, p_parts jsonb,
  p_expected numeric, p_later_due date default null, p_later_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os      service_orders%rowtype;
  v_op      uuid;
  v_reg     uuid;
  v_pay     uuid;
  v_rem     numeric;
  v_total   numeric := 0;
  v_later   numeric;
  v_part    jsonb;
  v_method  text;
  v_amt     numeric;
  v_inst    int;
  v_missing jsonb;
  v_lines   jsonb := '[]'::jsonb;
  v_was_done boolean;
begin
  -- Quem pode: dono ou operador com função gestor
  select id into v_op from workshop_operators where workshop_id = p_workshop and is_owner limit 1;
  if not is_workshop_owner(p_workshop, p_user) then
    select id into v_op from workshop_operators
     where workshop_id = p_workshop and profile_id = p_user and active and 'gestor' = any(roles) limit 1;
    if v_op is null then return jsonb_build_object('ok', false, 'error', 'so_gestor_fecha_a_os'); end if;
  end if;

  select * into v_os from service_orders where workshop_id = p_workshop and number = p_os_number order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'os_nao_encontrada'); end if;
  if v_os.status = 'cancelled' then return jsonb_build_object('ok', false, 'error', 'os_cancelada'); end if;

  v_rem := round(v_os.price - v_os.counter_discount - v_os.paid_amount, 2);
  if v_os.status = 'completed' and v_rem <= 0 then return jsonb_build_object('ok', false, 'error', 'os_ja_fechada'); end if;
  if coalesce(v_os.price, 0) <= 0 then return jsonb_build_object('ok', false, 'error', 'os_sem_valor'); end if;
  if p_expected is null or abs(v_rem - p_expected) > 0.01 then
    return jsonb_build_object('ok', false, 'error', 'valor_mudou', 'em_aberto_agora', v_rem);
  end if;

  -- Todo serviço precisa de responsável da loja (a comissão sai dele)
  select coalesce(jsonb_agg(description order by position), '[]'::jsonb) into v_missing
    from service_order_items where service_order_id = v_os.id and kind = 'labor' and workshop_mechanic_id is null;
  if jsonb_array_length(v_missing) > 0 or not exists (select 1 from service_order_items where service_order_id = v_os.id and kind = 'labor') then
    return jsonb_build_object('ok', false, 'error', 'faltam_responsaveis', 'servicos_sem_responsavel', v_missing);
  end if;

  -- Formas de pagamento
  if jsonb_typeof(coalesce(p_parts, '[]'::jsonb)) <> 'array' then return jsonb_build_object('ok', false, 'error', 'formas_invalidas'); end if;
  for v_part in select * from jsonb_array_elements(coalesce(p_parts, '[]'::jsonb)) loop
    v_method := v_part->>'method';
    v_amt := round(coalesce((v_part->>'amount')::numeric, 0), 2);
    if v_method not in ('dinheiro', 'pix', 'debito', 'credito') then return jsonb_build_object('ok', false, 'error', 'forma_invalida', 'forma', v_method); end if;
    if v_amt <= 0 then return jsonb_build_object('ok', false, 'error', 'valor_invalido', 'forma', v_method); end if;
    v_total := v_total + v_amt;
  end loop;
  if v_total > v_rem + 0.001 then return jsonb_build_object('ok', false, 'error', 'passa_do_valor_em_aberto', 'em_aberto', v_rem, 'informado', v_total); end if;
  v_later := round(v_rem - v_total, 2);
  if v_later > 0.004 and p_later_due is null then
    return jsonb_build_object('ok', false, 'error', 'falta_valor', 'faltam', v_later, 'detalhe', 'As formas não cobrem o valor em aberto: some em outra forma ou informe o vencimento do "pagar depois".');
  end if;
  if v_later > 0.004 and p_later_due < current_date - 1 then return jsonb_build_object('ok', false, 'error', 'vencimento_no_passado'); end if;

  if v_total > 0 then
    v_reg := (select id from cash_registers where workshop_id = p_workshop and status = 'open');
    if v_reg is null then return jsonb_build_object('ok', false, 'error', 'caixa_fechado', 'detalhe', 'Abra o caixa antes de receber.'); end if;

    insert into os_payments (workshop_id, register_id, service_order_id, amount, discount, cash_given, change_given, operator_id, created_by)
    values (p_workshop, v_reg, v_os.id, v_total, 0, null, 0, v_op, p_user)
    returning id into v_pay;

    for v_part in select * from jsonb_array_elements(p_parts) loop
      v_method := v_part->>'method';
      v_amt := round((v_part->>'amount')::numeric, 2);
      v_inst := case when v_method = 'credito' then greatest(1, least(24, coalesce((v_part->>'installments')::int, 1))) else 1 end;
      insert into cash_entries (workshop_id, register_id, kind, method, amount, installments, description, payment_id, operator_id, role, created_by)
      values (p_workshop, v_reg, 'recebimento', v_method, v_amt, v_inst, 'OS nº ' || coalesce(lpad(v_os.number::text, 4, '0'), left(v_os.id::text, 8)), v_pay, v_op, 'gestor', p_user);
      v_lines := v_lines || jsonb_build_object('forma', v_method, 'valor', v_amt, 'parcelas', v_inst);
    end loop;

    update service_orders
       set paid_amount = paid_amount + v_total,
           paid_at = case when round(price - counter_discount - paid_amount - v_total, 2) <= 0 then now() else null end
     where id = v_os.id;
  end if;

  if v_later > 0.004 then
    update service_orders set pay_later_due = p_later_due, pay_later_note = nullif(trim(coalesce(p_later_note, '')), ''),
           pay_later_set_at = now(), pay_later_by = v_op where id = v_os.id;
  end if;

  -- Concluir (o gatilho da OS baixa o estoque das peças)
  v_was_done := v_os.status = 'completed';
  if not v_was_done then
    update service_order_pauses set ended_at = now() where service_order_id = v_os.id and ended_at is null;
    update service_orders set status = 'completed', completed_at = coalesce(completed_at, now()),
           started_at = coalesce(started_at, now()) where id = v_os.id;
  end if;

  return jsonb_build_object('ok', true, 'os_numero', v_os.number, 'total_os', v_os.price, 'recebido_agora', v_total,
    'formas', v_lines, 'pagar_depois', case when v_later > 0.004 then v_later else 0 end,
    'vencimento', case when v_later > 0.004 then p_later_due else null end, 'concluida_agora', not v_was_done);
end $$;

revoke all on function public.orc_close_os(uuid, uuid, integer, jsonb, numeric, date, text) from public, anon, authenticated;
grant execute on function public.orc_close_os(uuid, uuid, integer, jsonb, numeric, date, text) to service_role;
