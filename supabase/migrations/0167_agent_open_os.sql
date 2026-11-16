-- Recepção abre a OS do cliente (opcional: ai_agents.settings.open_os = true, desligado por padrão).
--
-- Quando o cliente já passou o problema (e o carro), a Recepção chama agent_open_os: ela acha ou cria o cliente
-- pelo telefone da conversa, acha ou cria o carro (só se houver placa), abre a OS como "aberta" com valor 0 e
-- um item por serviço — igual à "Nova OS" do sistema — marcada source = 'whatsapp_agent'.
-- Não agenda nem coloca valor: horário e preço continuam sendo confirmados por uma pessoa da equipe.
--
-- Regras de segurança (a entrada vem de WhatsApp, ou seja, de qualquer pessoa):
--  · uma OS por atendimento (idempotente: chamar de novo devolve a mesma OS)
--  · teto de 15 OS por dia por oficina abertas pela IA
--  · textos limpos e com tamanho máximo; só o service_role chama (edge function agent-reception)

alter table public.whatsapp_chats
  add column if not exists agent_os_id uuid references public.service_orders(id) on delete set null;

create or replace function public.agent_open_os(
  p_chat uuid, p_car text, p_plate text, p_problem text, p_when text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c            whatsapp_chats%rowtype;
  v_customer   uuid;
  v_vehicle    uuid;
  v_os         uuid;
  v_num        integer;
  v_problem    text := left(btrim(regexp_replace(coalesce(p_problem, ''), '\s+', ' ', 'g')), 200);
  v_car        text := left(btrim(regexp_replace(coalesce(p_car, ''), '\s+', ' ', 'g')), 80);
  v_when       text := left(btrim(regexp_replace(coalesce(p_when, ''), '\s+', ' ', 'g')), 80);
  v_plate      text := upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  v_digits     text;
  v_name       text;
  v_year       integer;
  v_desc       text;
  v_today      integer;
  v_new_cust   boolean := false;
begin
  select * into c from whatsapp_chats where id = p_chat for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'conversa_nao_encontrada'); end if;

  -- Idempotente: este atendimento já virou OS
  if c.agent_os_id is not null then
    select number into v_num from service_orders where id = c.agent_os_id;
    return jsonb_build_object('ok', true, 'already', true, 'os_id', c.agent_os_id, 'number', v_num);
  end if;

  if length(v_problem) < 3 then return jsonb_build_object('ok', false, 'error', 'problema_vazio'); end if;
  if length(v_plate) <> 7 then v_plate := ''; end if;

  -- Teto diário de OS abertas pela IA (dia de Brasília)
  select count(*) into v_today from service_orders
   where workshop_id = c.workshop_id and source = 'whatsapp_agent'
     and created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
  if v_today >= 15 then return jsonb_build_object('ok', false, 'error', 'limite_diario'); end if;

  -- Cliente: o da conversa, o que bate com o telefone, ou um novo
  v_customer := c.customer_id;
  if v_customer is null then v_customer := match_customer_by_phone(c.workshop_id, c.phone); end if;
  if v_customer is null then
    v_digits := regexp_replace(coalesce(c.phone, ''), '\D', '', 'g');
    v_name := coalesce(nullif(left(btrim(coalesce(c.name, '')), 80), ''), 'Cliente WhatsApp ' || right(v_digits, 4));
    insert into customers (workshop_id, full_name, phone, source)
    values (c.workshop_id, v_name, nullif(v_digits, ''), 'whatsapp')
    returning id into v_customer;
    v_new_cust := true;
  end if;

  -- Carro: pela placa (cria se não existir) ou, sem placa, o carro do cliente que bate com o que ele disse
  if v_plate <> '' then
    select id into v_vehicle from vehicles
     where workshop_id = c.workshop_id and customer_id = v_customer and upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g')) = v_plate
     limit 1;
    if v_vehicle is null and not exists (
      select 1 from vehicles where workshop_id = c.workshop_id and upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g')) = v_plate
    ) then
      v_year := nullif(substring(v_car from '(?:19|20)\d{2}'), '')::integer;
      insert into vehicles (workshop_id, customer_id, plate, make, model, year)
      values (c.workshop_id, v_customer, v_plate, 'Não informado',
              coalesce(nullif(btrim(regexp_replace(v_car, '\m(?:19|20)\d{2}\M', '', 'g')), ''), 'Não informado'), v_year)
      returning id into v_vehicle;
    end if;
  elsif v_car <> '' and not v_new_cust then
    select v.id into v_vehicle from vehicles v
     where v.workshop_id = c.workshop_id and v.customer_id = v_customer
       and length(btrim(v.model)) >= 3 and v_car ilike '%' || btrim(v.model) || '%'
     group by v.id having count(*) = 1
     limit 1;
    -- só vale se for um único carro que bate
    if (select count(*) from vehicles v
         where v.workshop_id = c.workshop_id and v.customer_id = v_customer
           and length(btrim(v.model)) >= 3 and v_car ilike '%' || btrim(v.model) || '%') <> 1 then
      v_vehicle := null;
    end if;
  end if;

  v_desc := concat_ws(E'\n',
    '🤖 Aberta pela Recepção (WhatsApp). Confirme horário e valor com o cliente.',
    case when v_car <> '' then 'Carro: ' || v_car end,
    case when v_plate <> '' then 'Placa: ' || v_plate end,
    'Problema: ' || v_problem,
    case when v_when <> '' then 'Pode trazer: ' || v_when end
  );

  insert into service_orders (workshop_id, customer_id, vehicle_id, title, description, status, price, source)
  values (c.workshop_id, v_customer, v_vehicle, left(v_problem, 120), v_desc, 'open', 0, 'whatsapp_agent')
  returning id, number into v_os, v_num;

  insert into service_order_items (service_order_id, workshop_id, kind, description, quantity, unit_price, position)
  values (v_os, c.workshop_id, 'labor', v_problem, 1, 0, 0);

  update whatsapp_chats set agent_os_id = v_os, customer_id = coalesce(customer_id, v_customer) where id = c.id;

  insert into whatsapp_chat_notes (workshop_id, chat_id, author_name, body)
  values (c.workshop_id, c.id, 'Assistente virtual 🤖',
          '📋 OS ' || v_num || ' aberta pela Recepção (sem valor e sem horário). Confira e confirme com o cliente.');

  return jsonb_build_object('ok', true, 'already', false, 'os_id', v_os, 'number', v_num,
                            'new_customer', v_new_cust, 'vehicle', v_vehicle is not null);
end $$;

revoke all on function public.agent_open_os(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.agent_open_os(uuid, text, text, text, text) to service_role;
