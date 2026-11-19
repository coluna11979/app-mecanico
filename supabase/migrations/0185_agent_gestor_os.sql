-- Orçamentista com os poderes do gestor na OS (o que a tela da OS faz):
--  · orc_os_progress: aprovar (cliente aprovou), iniciar, pausar, retomar, concluir SEM receber (valor fica a receber),
--    agendar e tirar agendamento. Mesmos efeitos da tela: concluir fecha pausas e relógios; o gatilho baixa o estoque.
--  · orc_os_update: editar dados (título, reclamação, observações, KM, horas estimadas) e o desconto da OS.
-- Só gestor ou dono. OS concluída/cancelada não muda aqui (concluída → orc_reopen_os).

create or replace function public.orc_is_manager(p_workshop uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_workshop_owner(p_workshop, p_user)
      or exists (select 1 from workshop_operators where workshop_id = p_workshop and profile_id = p_user and active and 'gestor' = any(roles));
$$;
revoke all on function public.orc_is_manager(uuid, uuid) from public, anon, authenticated;
grant execute on function public.orc_is_manager(uuid, uuid) to service_role;

create or replace function public.orc_os_progress(
  p_workshop uuid, p_user uuid, p_os_number integer, p_acao text,
  p_canal text default null, p_motivo text default null, p_quando timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os   service_orders%rowtype;
  v_now  timestamptz := now();
  v_pause boolean;
  v_reasons text[] := array['Aguardando peça', 'Aguardando aprovação do cliente', 'Fim do expediente', 'Outro serviço prioritário', 'Outro'];
  v_msg  text;
begin
  if not orc_is_manager(p_workshop, p_user) then return jsonb_build_object('ok', false, 'error', 'so_gestor'); end if;
  if p_acao not in ('aprovar', 'iniciar', 'pausar', 'retomar', 'concluir', 'agendar', 'desagendar') then
    return jsonb_build_object('ok', false, 'error', 'acao_invalida');
  end if;

  select * into v_os from service_orders where workshop_id = p_workshop and number = p_os_number order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'os_nao_encontrada'); end if;
  if v_os.status = 'completed' then return jsonb_build_object('ok', false, 'error', 'os_concluida', 'detalhe', 'Para mudar, reabra com orc_reabrir_os.'); end if;
  if v_os.status = 'cancelled' and not (p_acao = 'aprovar' and v_os.quote_status = 'declined') then
    return jsonb_build_object('ok', false, 'error', 'os_cancelada');
  end if;
  v_pause := exists (select 1 from service_order_pauses where service_order_id = v_os.id and ended_at is null);

  if p_acao = 'aprovar' then
    if v_os.status not in ('open', 'awaiting_approval', 'cancelled') then return jsonb_build_object('ok', false, 'error', 'ja_aprovada', 'status', v_os.status); end if;
    if p_canal is not null and p_canal not in ('whatsapp', 'telefone', 'presencial') then return jsonb_build_object('ok', false, 'error', 'canal_invalido'); end if;
    update service_orders set status = 'approved', approved_at = v_now, approval_channel = p_canal, quote_status = null where id = v_os.id;
    v_msg := 'Orçamento aprovado';

  elsif p_acao = 'iniciar' then
    if v_os.status = 'in_progress' then return jsonb_build_object('ok', false, 'error', 'ja_iniciada'); end if;
    update service_orders set status = 'in_progress', started_at = coalesce(started_at, v_now),
           approved_at = coalesce(approved_at, v_now), quote_status = null where id = v_os.id;
    v_msg := 'Serviço iniciado';

  elsif p_acao = 'pausar' then
    if v_os.status <> 'in_progress' then return jsonb_build_object('ok', false, 'error', 'so_pausa_em_andamento', 'status', v_os.status); end if;
    if v_pause then return jsonb_build_object('ok', false, 'error', 'ja_pausada'); end if;
    if p_motivo is null or not (p_motivo = any (v_reasons)) then
      return jsonb_build_object('ok', false, 'error', 'motivo_obrigatorio', 'motivos', to_jsonb(v_reasons));
    end if;
    insert into service_order_pauses (service_order_id, workshop_id, reason) values (v_os.id, p_workshop, p_motivo);
    v_msg := 'Serviço pausado: ' || lower(p_motivo);

  elsif p_acao = 'retomar' then
    if not v_pause then return jsonb_build_object('ok', false, 'error', 'nao_esta_pausada'); end if;
    update service_order_pauses set ended_at = v_now where service_order_id = v_os.id and ended_at is null;
    v_msg := 'Serviço retomado';

  elsif p_acao = 'concluir' then
    if not exists (select 1 from service_order_items where service_order_id = v_os.id) then return jsonb_build_object('ok', false, 'error', 'os_sem_itens'); end if;
    if p_quando is not null and (p_quando > v_now + interval '5 minutes' or p_quando < v_os.created_at - interval '1 day') then
      return jsonb_build_object('ok', false, 'error', 'data_invalida', 'detalhe', 'Entre a abertura da OS e agora.');
    end if;
    update service_order_pauses set ended_at = v_now where service_order_id = v_os.id and ended_at is null;
    update service_order_work_logs set ended_at = v_now, finished = true where service_order_id = v_os.id and ended_at is null;
    update service_orders set status = 'completed', completed_at = coalesce(p_quando, v_now),
           started_at = coalesce(started_at, p_quando, v_now) where id = v_os.id;
    v_msg := 'OS concluída';

  elsif p_acao = 'agendar' then
    if p_quando is null then return jsonb_build_object('ok', false, 'error', 'data_hora_obrigatoria'); end if;
    if p_quando < v_now - interval '1 hour' then return jsonb_build_object('ok', false, 'error', 'data_no_passado'); end if;
    update service_orders set scheduled_at = p_quando, schedule_status = null, schedule_reminded_at = null, schedule_status_at = null where id = v_os.id;
    v_msg := 'OS agendada';

  else -- desagendar
    update service_orders set scheduled_at = null, schedule_status = null, schedule_reminded_at = null, schedule_status_at = null where id = v_os.id;
    v_msg := 'Agendamento retirado';
  end if;

  select * into v_os from service_orders where id = v_os.id;
  return jsonb_build_object('ok', true, 'os_numero', v_os.number, 'mensagem', v_msg, 'status', v_os.status,
    'agendada_para', v_os.scheduled_at, 'concluida_em', v_os.completed_at,
    'em_aberto', round(v_os.price - v_os.counter_discount - v_os.paid_amount, 2));
end $$;
revoke all on function public.orc_os_progress(uuid, uuid, integer, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.orc_os_progress(uuid, uuid, integer, text, text, text, timestamptz) to service_role;

create or replace function public.orc_os_update(
  p_workshop uuid, p_user uuid, p_os_number integer,
  p_titulo text default null, p_descricao text default null, p_obs text default null,
  p_km integer default null, p_horas numeric default null, p_desconto numeric default null
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
  if p_titulo is null and p_descricao is null and p_obs is null and p_km is null and p_horas is null and p_desconto is null then
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
    discount    = coalesce(p_desconto, discount)
   where id = v_os.id;  -- o gatilho recalcula o total quando muda o desconto

  select * into v_os from service_orders where id = v_os.id;
  return jsonb_build_object('ok', true, 'os_numero', v_os.number, 'titulo', v_os.title, 'reclamacao', v_os.description,
    'observacoes', v_os.notes, 'km', v_os.km_reading, 'horas_estimadas', v_os.estimated_hours,
    'desconto', v_os.discount, 'total_os', v_os.price, 'em_aberto', round(v_os.price - v_os.counter_discount - v_os.paid_amount, 2));
end $$;
revoke all on function public.orc_os_update(uuid, uuid, integer, text, text, text, integer, numeric, numeric) from public, anon, authenticated;
grant execute on function public.orc_os_update(uuid, uuid, integer, text, text, text, integer, numeric, numeric) to service_role;

update ai_agents set tools = array_append(tools, 'orc_andamento_os')
 where template = 'orcamento' and not ('orc_andamento_os' = any (tools));
update ai_agents set tools = array_append(tools, 'orc_editar_os')
 where template = 'orcamento' and not ('orc_editar_os' = any (tools));
