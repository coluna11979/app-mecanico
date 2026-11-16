-- Orçamentista: cancelar OS e corrigir cadastro (cliente e carro).
--  · orc_cancel_os: cancela a OS pelo número (ou marca "cliente não aprovou"). Recusa OS concluída ou com recebimento
--    ativo (isso o dono resolve pelo caixa). Encerra pausa aberta; o estoque volta pelo gatilho da OS, como na tela.
--  · orc_fix_registration: corrige (sobrescreve) nome/telefone/e-mail do cliente e marca/modelo/ano/placa do carro,
--    achando cliente e carro pela OS ou pelo id. Não duplica placa nem telefone. Mudou modelo/ano: solta a ficha técnica.
-- Só o service_role executa.

create or replace function public.orc_cancel_os(p_workshop uuid, p_os_number integer, p_declined boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os service_orders%rowtype;
begin
  select * into v_os from service_orders where workshop_id = p_workshop and number = p_os_number order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'os_nao_encontrada'); end if;
  if v_os.status = 'cancelled' then return jsonb_build_object('ok', true, 'ja_cancelada', true, 'os_numero', v_os.number); end if;
  if v_os.status = 'completed' then return jsonb_build_object('ok', false, 'error', 'os_concluida_nao_cancela'); end if;
  if coalesce(v_os.paid_amount, 0) > 0 or exists (
       select 1 from os_payments p where p.service_order_id = v_os.id and p.cancelled_at is null) then
    return jsonb_build_object('ok', false, 'error', 'os_com_recebimento', 'detalhe', 'Tem recebimento lançado: o dono estorna pelo caixa antes.');
  end if;

  update service_order_pauses set ended_at = now() where service_order_id = v_os.id and ended_at is null;
  update service_orders set status = 'cancelled', quote_status = case when p_declined then 'declined' else quote_status end
   where id = v_os.id;
  return jsonb_build_object('ok', true, 'os_numero', v_os.number, 'nao_aprovado', coalesce(p_declined, false));
end $$;

create or replace function public.orc_fix_registration(
  p_workshop uuid, p_os_number integer, p_customer uuid, p_vehicle uuid,
  p_nome text, p_telefone text, p_email text, p_marca text, p_modelo text, p_ano integer, p_placa text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os     service_orders%rowtype;
  v_cust   uuid := p_customer;
  v_veh    uuid := p_vehicle;
  v_name   text := left(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), 100);
  v_phone  text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_email  text := left(btrim(coalesce(p_email, '')), 120);
  v_make   text := left(btrim(coalesce(p_marca, '')), 60);
  v_model  text := left(btrim(coalesce(p_modelo, '')), 60);
  v_plate  text := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
  v_year   integer := case when p_ano between 1950 and extract(year from now())::int + 1 then p_ano end;
  v_dup    uuid;
  v_old    vehicles%rowtype;
  v_c      customers%rowtype;
  v_v      vehicles%rowtype;
begin
  if p_os_number is not null then
    select * into v_os from service_orders where workshop_id = p_workshop and number = p_os_number order by created_at desc limit 1;
    if not found then return jsonb_build_object('ok', false, 'error', 'os_nao_encontrada'); end if;
    v_cust := coalesce(v_cust, v_os.customer_id);
    v_veh  := coalesce(v_veh, v_os.vehicle_id);
  end if;
  if v_cust is null and v_veh is null then return jsonb_build_object('ok', false, 'error', 'informe_os_numero_ou_ids'); end if;

  if v_phone is not null and v_cust is not null then
    v_dup := match_customer_by_phone(p_workshop, v_phone);
    if v_dup is not null and v_dup <> v_cust then
      return jsonb_build_object('ok', false, 'error', 'telefone_ja_cadastrado', 'cliente_id', v_dup,
                                'nome', (select full_name from customers where id = v_dup));
    end if;
  end if;
  if length(v_plate) = 7 and v_veh is not null then
    select v.id into v_dup from vehicles v
     where v.workshop_id = p_workshop and v.id <> v_veh and upper(regexp_replace(v.plate, '[^A-Za-z0-9]', '', 'g')) = v_plate limit 1;
    if v_dup is not null then
      return jsonb_build_object('ok', false, 'error', 'placa_ja_cadastrada', 'veiculo_id', v_dup,
                                'nome', (select c.full_name from vehicles v join customers c on c.id = v.customer_id where v.id = v_dup));
    end if;
  elsif v_plate <> '' and length(v_plate) <> 7 then
    return jsonb_build_object('ok', false, 'error', 'placa_invalida');
  end if;

  if v_cust is not null then
    update customers set
      full_name = case when length(v_name) >= 2 then v_name else full_name end,
      phone     = case when v_phone is not null then v_phone else phone end,
      email     = case when v_email <> '' then v_email else email end
     where id = v_cust and workshop_id = p_workshop
     returning * into v_c;
    if not found then return jsonb_build_object('ok', false, 'error', 'cliente_nao_encontrado'); end if;
  end if;

  if v_veh is not null then
    select * into v_old from vehicles where id = v_veh and workshop_id = p_workshop;
    if not found then return jsonb_build_object('ok', false, 'error', 'carro_nao_encontrado'); end if;
    update vehicles set
      make  = case when v_make <> '' then v_make else make end,
      model = case when v_model <> '' then v_model else model end,
      year  = coalesce(v_year, year),
      plate = case when length(v_plate) = 7 then v_plate else plate end,
      -- mudou modelo ou ano: a ficha vinculada pode não valer mais
      tech_vehicle_id = case when (v_model <> '' and orc_norm(v_model) <> orc_norm(v_old.model))
                               or (v_year is not null and v_year is distinct from v_old.year) then null else tech_vehicle_id end
     where id = v_veh
     returning * into v_v;
  end if;

  return jsonb_build_object('ok', true,
    'cliente', case when v_c.id is null then null else jsonb_build_object('nome', v_c.full_name, 'telefone', v_c.phone, 'email', v_c.email) end,
    'carro', case when v_v.id is null then null else jsonb_build_object('marca', v_v.make, 'modelo', v_v.model, 'ano', v_v.year, 'placa', v_v.plate) end);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'orc_cancel_os(uuid,integer,boolean)',
    'orc_fix_registration(uuid,integer,uuid,uuid,text,text,text,text,text,integer,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
