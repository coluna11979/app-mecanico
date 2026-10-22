-- ════════════════════════════════════════════════════════════════════════════
-- DEMONSTRAÇÃO — oficina fake "Check All" (be54b880-2983-4703-8221-01efb837298c)
-- Gera ~18 meses de operação realista para apresentações e para o Plano VIP:
--   • equipe de 5 com perfis diferentes (especialistas, aprendiz, quem tem retorno)
--   • ~600 clientes (fiéis, regulares e sumidos), ~720 carros, ~100 OS/mês
--   • OS com itens, aprovação, cronômetro, pausas, descontos, orçamentos recusados
--   • retornos/garantia, recomendações em aberto, OS em andamento hoje
--   • vitrine preenchida (sem fotos)
--
-- Tudo marcado para limpeza: customers.source = 'demo', service_orders.source = 'demo',
-- workshop_mechanics.notes = 'DEMO'. Para apagar: supabase/demo/check_all_cleanup.sql
-- Telefones fictícios na faixa (11) 90000-0xxx; e-mails @example.com.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  wid     uuid := 'be54b880-2983-4703-8221-01efb837298c';
  now_ts  timestamptz := now();
  m_rai   uuid := '40c97afd-2841-4870-935e-a6db29d1aa6f';
  m_raf   uuid := 'f7699516-7c36-4ca1-84df-17058dea25f0';
  m_car uuid; m_and uuid; m_die uuid;
  mids    jsonb;

  fn text[] := array['Ana','Bruno','Carla','Daniel','Eduardo','Fernanda','Gabriel','Helena','Igor','Juliana','Kleber','Larissa','Marcelo','Natália','Otávio','Patrícia','Ricardo','Sabrina','Thiago','Vanessa','William','Aline','Rodrigo','Camila','Leandro','Priscila','Fábio','Renata','Gustavo','Tatiane','Márcio','Luciana','Diego','Simone','André','Cristiane','Vinícius','Adriana','Roberto','Elaine','Sérgio','Denise','Paulo','Regina','Wesley','Jéssica','Alexandre','Viviane','Fernando','Kátia','Luiz','Mariana','Júlio','Beatriz','Everton','Rosana'];
  ln text[] := array['Silva','Santos','Oliveira','Souza','Rodrigues','Ferreira','Alves','Pereira','Lima','Gomes','Costa','Ribeiro','Martins','Carvalho','Almeida','Lopes','Soares','Fernandes','Vieira','Barbosa','Rocha','Dias','Nascimento','Andrade','Moreira','Nunes','Marques','Machado','Mendes','Freitas','Cardoso','Ramos','Teixeira','Correia','Batista'];
  cars jsonb := '[["Chevrolet","Onix"],["Chevrolet","Prisma"],["Chevrolet","Tracker"],["Chevrolet","S10"],["Volkswagen","Gol"],["Volkswagen","Polo"],["Volkswagen","T-Cross"],["Volkswagen","Saveiro"],["Volkswagen","Virtus"],["Fiat","Argo"],["Fiat","Mobi"],["Fiat","Strada"],["Fiat","Uno"],["Fiat","Toro"],["Hyundai","HB20"],["Hyundai","Creta"],["Toyota","Corolla"],["Toyota","Etios"],["Toyota","Hilux"],["Honda","Civic"],["Honda","Fit"],["Honda","HR-V"],["Renault","Sandero"],["Renault","Kwid"],["Renault","Duster"],["Ford","Ka"],["Ford","EcoSport"],["Ford","Ranger"],["Jeep","Renegade"],["Jeep","Compass"],["Nissan","Kicks"],["Nissan","Versa"],["Peugeot","208"],["Citroën","C3"]]';
  colors text[] := array['Prata','Branco','Preto','Cinza','Vermelho','Azul','Prata','Branco','Preto','Cinza'];

  -- [categoria, peso, minutos base, horas estimadas, título, mão de obra [[desc,min,max]], peças [[desc,min,max,qtd,prob]]]
  cats jsonb := '[
    ["Troca de óleo", 30, 40, 0.75, "Troca de óleo e filtros",
      [["Mão de obra — troca de óleo e filtro",60,90]],
      [["Óleo 5W30 sintético (litro)",38,55,4,1],["Filtro de óleo",35,60,1,1],["Filtro de ar do motor",45,80,1,0.45]]],
    ["Revisão geral", 12, 150, 2.5, "Revisão completa",
      [["Revisão completa (checklist 40 itens)",220,380]],
      [["Óleo 5W30 sintético (litro)",38,55,4,1],["Filtro de óleo",35,60,1,1],["Filtro de ar do motor",45,80,1,1],["Filtro de combustível",40,75,1,0.7],["Filtro de cabine",45,90,1,0.8]]],
    ["Freios", 14, 90, 1.5, "Troca de pastilhas de freio",
      [["Troca de pastilhas dianteiras",120,180]],
      [["Jogo de pastilhas dianteiras",140,260,1,1],["Fluido de freio DOT4",35,55,1,0.6],["Par de discos de freio dianteiros",320,560,1,0.3]]],
    ["Suspensão", 8, 180, 3, "Troca de amortecedores",
      [["Troca de amortecedores dianteiros",280,420]],
      [["Amortecedor dianteiro",290,520,2,1],["Kit batente e coifa",80,140,2,1],["Bieleta",60,110,2,0.4]]],
    ["Alinhamento", 8, 40, 0.75, "Alinhamento 3D",
      [["Alinhamento 3D",90,130]], []],
    ["Balanceamento", 6, 35, 0.5, "Balanceamento das rodas",
      [["Balanceamento 4 rodas",60,100]], [["Contrapesos",15,30,1,1]]],
    ["Pneus", 5, 50, 1, "Troca de pneus",
      [["Montagem e balanceamento",80,120]], [["Pneu 175/70 R14",320,480,2,1],["Válvula de pneu",10,20,2,0.7]]],
    ["Embreagem", 4, 300, 5, "Troca do kit de embreagem",
      [["Troca do kit de embreagem",450,700]],
      [["Kit de embreagem (platô, disco e rolamento)",780,1400,1,1],["Fluido de embreagem",35,60,1,0.5]]],
    ["Motor", 3, 420, 8, "Reparo do motor",
      [["Reparo de cabeçote e sincronismo",900,1800]],
      [["Jogo de juntas do motor",280,520,1,1],["Correia dentada + tensor",260,480,1,1],["Bomba d''água",180,320,1,0.5]]],
    ["Injeção eletrônica", 5, 120, 2, "Limpeza de bicos e diagnóstico da injeção",
      [["Limpeza de bicos e diagnóstico",180,280]],
      [["Vela de ignição",35,70,4,1],["Bobina de ignição",280,480,1,0.3]]],
    ["Elétrica", 5, 100, 1.5, "Reparo elétrico",
      [["Diagnóstico e reparo elétrico",150,260]],
      [["Bateria 60Ah",420,620,1,0.5],["Lâmpada farol H4",35,70,2,0.4]]],
    ["Ar-condicionado", 5, 90, 1.5, "Higienização e recarga do ar-condicionado",
      [["Higienização e recarga de gás",180,260]],
      [["Gás R134a",90,160,1,1],["Filtro de cabine",45,90,1,1]]],
    ["Diagnóstico", 4, 45, 0.75, "Diagnóstico com scanner",
      [["Diagnóstico com scanner",100,160]], []],
    ["Câmbio", 1, 240, 4, "Reparo do câmbio",
      [["Troca de óleo e reparo do câmbio",380,650]], [["Óleo de câmbio (litro)",55,90,3,1]]]
  ]';

  -- Perfil de cada colaborador por serviço: [fator de tempo, peso de escala, chance de retorno]
  skills jsonb := '{
    "rai": {"Motor":[0.8,6,0.02],"Embreagem":[0.85,5,0.015],"Câmbio":[0.85,5,0.02],"Injeção eletrônica":[0.9,2,0.02],"Revisão geral":[1.0,2,0.01],"Suspensão":[1.0,1,0.02],"Diagnóstico":[0.9,2,0.02],"Troca de óleo":[1.0,1,0.005],"Freios":[1.05,1,0.01]},
    "raf": {"Freios":[0.8,6,0.01],"Suspensão":[0.9,6,0.09],"Revisão geral":[0.9,4,0.015],"Troca de óleo":[0.95,2,0.005],"Embreagem":[1.15,1,0.03],"Diagnóstico":[1.1,1,0.03]},
    "car": {"Elétrica":[0.75,7,0.02],"Ar-condicionado":[0.8,7,0.015],"Injeção eletrônica":[0.85,5,0.02],"Diagnóstico":[0.8,4,0.01]},
    "and": {"Alinhamento":[0.85,7,0.01],"Balanceamento":[0.85,7,0.01],"Pneus":[0.8,7,0.005],"Freios":[1.1,1,0.02],"Troca de óleo":[1.0,2,0.005]},
    "die": {"Troca de óleo":[1.3,6,0.07],"Revisão geral":[1.35,1,0.05],"Balanceamento":[1.25,2,0.04],"Pneus":[1.2,1,0.03]}
  }';

  recs text[] := array[
    'Pastilhas de freio dianteiras com ~30% — trocar em até 3 meses',
    'Correia dentada próxima do vencimento — trocar nos próximos 5 mil km',
    'Amortecedores traseiros com início de vazamento',
    'Pneus dianteiros com desgaste irregular — fazer alinhamento',
    'Fluido de freio vencido — recomendada a troca',
    'Bateria com carga fraca — testar na próxima visita',
    'Higienização do ar-condicionado recomendada',
    'Filtro de combustível vencido',
    'Velas de ignição no fim da vida útil',
    'Coxim do motor com folga',
    'Discos de freio no limite de espessura',
    'Óleo do câmbio nunca trocado — recomendada a troca'];
  complaints text[] := array[
    'Barulho voltou na roda dianteira', 'Luz da injeção acendeu de novo', 'Vazamento no filtro de óleo',
    'Ar voltou a gelar pouco', 'Carro puxando para o lado', 'Pedal de freio baixo', 'Ruído na suspensão ao passar em lombada'];

  i int; k int; n int; nveh int;
  cid uuid; vid uuid; osid uuid; rid uuid;
  ctype float; created timestamptz; stop_ts timestamptz; t timestamptz; step_days float;
  pl text; car jsonb; nm text;
  v record; c jsonb; cat text; v_title text; mk text; key text;
  tot float; r float; w float; factor float; rework_p float;
  opened timestamptz; req_at timestamptz; appr_at timestamptz; started timestamptz; done_at timestamptz;
  worked int; pause_len int; pause_reason text; est numeric; disc numeric; channel text; declined bool;
  item jsonb; qty numeric; price numeric; cat2 jsonb;
  pipeline text[] := array['open','open','awaiting_approval','awaiting_approval','approved','in_progress','in_progress_paused','completed','completed','completed'];
begin
  perform setseed(0.4242);

  -- ── Equipe ────────────────────────────────────────────────────────────────
  update workshop_mechanics set name = 'Raimundo Soares', role_title = 'Mecânico chefe', specialty = 'Motor, embreagem e câmbio',
    commission_percent = 35, hired_at = '2018-04-02', employment_type = 'clt', work_schedule = 'Seg a Sex 8h–18h, Sáb 8h–12h',
    status = 'active', active = true where id = m_rai;
  update workshop_mechanics set name = 'Rafael Souza', role_title = 'Mecânico', specialty = 'Freios e suspensão',
    commission_percent = 30, hired_at = '2021-07-12', employment_type = 'clt', work_schedule = 'Seg a Sex 8h–18h, Sáb 8h–12h',
    status = 'active', active = true where id = m_raf;
  insert into workshop_mechanics (workshop_id, name, role_title, specialty, commission_percent, hired_at, employment_type, work_schedule, status, active, phone, notes)
    values (wid, 'Carlos Mendes', 'Eletricista', 'Elétrica, injeção e ar-condicionado', 30, '2020-10-05', 'clt', 'Seg a Sex 8h–18h', 'active', true, '(11) 90000-0901', 'DEMO')
    returning id into m_car;
  insert into workshop_mechanics (workshop_id, name, role_title, specialty, commission_percent, hired_at, employment_type, work_schedule, status, active, phone, notes)
    values (wid, 'Anderson Lima', 'Alinhador', 'Alinhamento, balanceamento e pneus', 25, '2022-03-14', 'clt', 'Seg a Sex 8h–18h, Sáb 8h–12h', 'active', true, '(11) 90000-0902', 'DEMO')
    returning id into m_and;
  insert into workshop_mechanics (workshop_id, name, role_title, specialty, commission_percent, hired_at, employment_type, work_schedule, status, active, phone, notes)
    values (wid, 'Diego Rocha', 'Auxiliar', 'Troca de óleo e revisões', 20, '2026-02-02', 'clt', 'Seg a Sex 8h–17h', 'active', true, '(11) 90000-0903', 'DEMO')
    returning id into m_die;
  mids := jsonb_build_object('rai', m_rai, 'raf', m_raf, 'car', m_car, 'and', m_and, 'die', m_die);

  create temp table demo_visits (cust uuid, veh uuid, t timestamptz, loyal bool) on commit drop;
  create temp table demo_veh (id uuid, base_km int, created timestamptz) on commit drop;

  -- ── Clientes, carros e datas de visita ────────────────────────────────────
  for i in 1..600 loop
    ctype := random();
    nm := fn[1 + floor(random() * array_length(fn, 1))::int] || ' ' || ln[1 + floor(random() * array_length(ln, 1))::int]
          || case when random() < 0.45 then ' ' || ln[1 + floor(random() * array_length(ln, 1))::int] else '' end;
    if ctype >= 0.62 then            -- sumidos: começaram há muito tempo e pararam de vir
      created := now_ts - make_interval(days => (380 + floor(random() * 160))::int);
      stop_ts := now_ts - make_interval(days => (195 + floor(random() * 170))::int);
      step_days := 110 + random() * 110;
    elsif ctype >= 0.30 then         -- regulares
      created := now_ts - make_interval(days => (60 + floor(random() * 480))::int);
      stop_ts := now_ts - interval '1 day';
      step_days := 150 + random() * 130;
    else                              -- fiéis
      created := now_ts - make_interval(days => (40 + floor(random() * 500))::int);
      stop_ts := now_ts - interval '1 day';
      step_days := 75 + random() * 70;
    end if;
    created := date_trunc('day', created) + make_interval(mins => (450 + floor(random() * 480))::int);

    insert into customers (workshop_id, full_name, phone, email, city, created_at, source, contact_opt_out)
    values (wid, nm, '(11) 90000-' || lpad(i::text, 4, '0'),
            case when random() < 0.4 then translate(lower(split_part(nm, ' ', 1)), 'áàâãéêíóôõúç', 'aaaaeeiooouc') || i || '@example.com' end,
            'São Paulo', created, 'demo', random() < 0.03)
    returning id into cid;

    nveh := case when random() < 0.2 then 2 else 1 end;
    for k in 1..nveh loop
      loop
        pl := chr(65 + floor(random() * 26)::int) || chr(65 + floor(random() * 26)::int) || chr(65 + floor(random() * 26)::int)
              || floor(random() * 10)::int || chr(65 + floor(random() * 26)::int) || lpad(floor(random() * 100)::int::text, 2, '0');
        exit when not exists (select 1 from vehicles where plate = pl);
      end loop;
      car := cars -> floor(random() * jsonb_array_length(cars))::int;
      insert into vehicles (customer_id, workshop_id, plate, make, model, year, color, created_at)
      values (cid, wid, pl, car ->> 0, car ->> 1, 2011 + floor(random() * 14)::int, colors[1 + floor(random() * 10)::int], created)
      returning id into vid;
      insert into demo_veh values (vid, 20000 + floor(random() * 120000)::int, created);
    end loop;

    t := created; n := 0;
    while t < stop_ts and n < 14 loop
      select id into vid from vehicles where customer_id = cid order by random() limit 1;
      insert into demo_visits values (cid, vid, t, ctype < 0.30);
      t := t + make_interval(days => greatest(20, (step_days * (0.75 + random() * 0.5))::int));
      t := date_trunc('day', t) + make_interval(mins => (450 + floor(random() * 510))::int);
      n := n + 1;
    end loop;
  end loop;

  -- ── Ordens de serviço (em ordem cronológica) ─────────────────────────────
  for v in select dv.*, vh.base_km, vh.created as vcreated from demo_visits dv join demo_veh vh on vh.id = dv.veh order by dv.t loop
    -- categoria (sorteio ponderado)
    select sum((x ->> 1)::float) into tot from jsonb_array_elements(cats) x;
    r := random() * tot; c := null;
    for c in select x from jsonb_array_elements(cats) x loop
      r := r - (c ->> 1)::float;
      exit when r <= 0;
    end loop;
    cat := c ->> 0; v_title := c ->> 4;

    -- quem executa (sorteio ponderado pela escala de cada um)
    tot := 0;
    for key in select jsonb_object_keys(skills) loop
      if key = 'die' and v.t < '2026-02-02' then continue; end if;
      tot := tot + coalesce((skills -> key -> cat ->> 1)::float, case when key = 'die' then 0 else 0.15 end);
    end loop;
    r := random() * tot; mk := 'rai';
    for key in select jsonb_object_keys(skills) loop
      if key = 'die' and v.t < '2026-02-02' then continue; end if;
      w := coalesce((skills -> key -> cat ->> 1)::float, case when key = 'die' then 0 else 0.15 end);
      r := r - w;
      if r <= 0 and w > 0 then mk := key; exit; end if;
    end loop;
    factor   := coalesce((skills -> mk -> cat ->> 0)::float, 1.1);
    rework_p := coalesce((skills -> mk -> cat ->> 2)::float, 0.03);

    opened := v.t;
    declined := random() < case when cat in ('Motor', 'Embreagem', 'Suspensão', 'Câmbio') then 0.2 else 0.06 end;
    est := case when random() < 0.85 then (c ->> 3)::numeric end;
    disc := 0;
    channel := null; req_at := null; appr_at := null; started := null; done_at := null; pause_len := 0; pause_reason := null;

    if random() < 0.6 or declined then
      req_at := opened + make_interval(mins => (15 + floor(random() * 50))::int);
      channel := case when random() < 0.7 then 'whatsapp' when random() < 0.66 then 'telefone' else 'presencial' end;
      appr_at := req_at + make_interval(mins => (8 + floor(random() * 200))::int);
    else
      channel := 'presencial';
      appr_at := opened + make_interval(mins => (5 + floor(random() * 15))::int);
    end if;

    if not declined then
      started := appr_at + make_interval(mins => (10 + floor(random() * 90))::int);
      worked := greatest(15, ((c ->> 2)::float * factor * (0.8 + random() * 0.45))::int);
      if worked > 240 and random() < 0.7 then
        pause_len := 840; pause_reason := 'Fim do expediente';
      elsif random() < 0.14 then
        pause_len := 60 + floor(random() * 1380)::int; pause_reason := 'Aguardando peça';
      elsif random() < 0.05 then
        pause_len := 20 + floor(random() * 90)::int; pause_reason := 'Outro serviço prioritário';
      end if;
      done_at := started + make_interval(mins => worked + pause_len);
      if done_at > now_ts - interval '2 hours' then continue; end if;   -- o "hoje" é montado no fim
      if random() < 0.12 then disc := (5 + floor(random() * 3) * 5); end if;   -- 5, 10 ou 15 reais
    end if;

    insert into service_orders (workshop_id, customer_id, vehicle_id, title, category, status, quote_status, price, discount,
      created_at, approval_requested_at, approved_at, approval_channel, started_at, completed_at, estimated_hours,
      km_reading, workshop_mechanic_id, source)
    values (wid, v.cust, v.veh, v_title, cat,
      (case when declined then 'cancelled' else 'completed' end)::os_status,
      case when declined then 'declined' end, 0, disc,
      opened, req_at, case when declined then null else appr_at end, case when declined then null else channel end,
      started, done_at, est,
      v.base_km + (extract(epoch from (v.t - v.vcreated)) / 86400 * (25 + random() * 25))::int,
      (mids ->> mk)::uuid, 'demo')
    returning id into osid;

    -- itens (o banco recalcula peças, mão de obra e total)
    k := 0;
    for item in select x from jsonb_array_elements(c -> 5) x loop
      price := round(((item ->> 1)::numeric + random()::numeric * ((item ->> 2)::numeric - (item ->> 1)::numeric)) / 5) * 5;
      insert into service_order_items (service_order_id, kind, description, quantity, unit_price, position)
      values (osid, 'labor', item ->> 0, 1, price, k); k := k + 1;
    end loop;
    for item in select x from jsonb_array_elements(c -> 6) x loop
      continue when random() > (item ->> 4)::float;
      price := floor((item ->> 1)::numeric + random()::numeric * ((item ->> 2)::numeric - (item ->> 1)::numeric)) + 0.90;
      insert into service_order_items (service_order_id, kind, description, quantity, unit_price, position)
      values (osid, 'part', item ->> 0, (item ->> 3)::numeric, price, k); k := k + 1;
    end loop;
    -- às vezes o cliente aproveita e faz mais um serviço
    if random() < 0.15 and cat not in ('Revisão geral', 'Troca de óleo') then
      cat2 := cats -> 0;   -- troca de óleo junto
      update service_orders set title = title || ' + Troca de óleo' where id = osid;
      insert into service_order_items (service_order_id, kind, description, quantity, unit_price, position)
      values (osid, 'labor', 'Mão de obra — troca de óleo e filtro', 1, 70, k),
             (osid, 'part', 'Óleo 5W30 sintético (litro)', 4, 45.90, k + 1),
             (osid, 'part', 'Filtro de óleo', 1, 42.90, k + 2);
      if not declined then
        update service_orders set completed_at = completed_at + interval '35 minutes' where id = osid;
        done_at := done_at + interval '35 minutes';
      end if;
    end if;

    if declined then continue; end if;

    if pause_reason is not null then
      insert into service_order_pauses (service_order_id, reason, started_at, ended_at)
      values (osid, pause_reason, started + make_interval(mins => (worked * 0.5)::int),
              started + make_interval(mins => (worked * 0.5)::int + pause_len));
    end if;

    -- recomendação para o futuro (base do CRM / reativação)
    if random() < 0.38 and done_at > now_ts - interval '16 months' then
      insert into service_recommendations (workshop_id, customer_id, vehicle_id, service_order_id, description, status, source, recommended_at, created_at)
      values (wid, v.cust, v.veh, osid, recs[1 + floor(random() * array_length(recs, 1))::int], 'pending', 'app', done_at, done_at);
    end if;

    -- retorno / garantia
    if random() < rework_p then
      t := done_at + make_interval(days => (4 + floor(random() * 40))::int, mins => floor(random() * 300)::int);
      if t < now_ts - interval '1 day' then
        insert into service_orders (workshop_id, customer_id, vehicle_id, title, category, status, price,
          created_at, approved_at, approval_channel, started_at, completed_at, workshop_mechanic_id, source,
          rework_of_id, rework_cause, rework_notes, description)
        values (wid, v.cust, v.veh, 'Retorno — ' || v_title, cat, 'completed', 0,
          t, t + interval '5 minutes', 'presencial', t + interval '40 minutes',
          t + make_interval(mins => 40 + (30 + floor(random() * 120))::int),
          case when random() < 0.7 then (mids ->> mk)::uuid else m_rai end, 'demo',
          osid,
          (array['execution','execution','execution','diagnosis','part','part','customer'])[1 + floor(random() * 7)::int],
          complaints[1 + floor(random() * array_length(complaints, 1))::int],
          complaints[1 + floor(random() * array_length(complaints, 1))::int]);
      end if;
    end if;
  end loop;

  -- Recomendações de quem voltou depois: a maioria já foi feita
  update service_recommendations sr set status = 'done'
   where sr.workshop_id = wid and sr.status = 'pending' and random() < 0.65
     and exists (select 1 from service_orders o where o.customer_id = sr.customer_id and o.status = 'completed'
                 and o.created_at > sr.recommended_at + interval '10 days');

  -- ── Movimento de hoje (funil do Painel) ──────────────────────────────────
  for i in 1..array_length(pipeline, 1) loop
    select dv.cust, dv.veh into cid, vid from demo_visits dv where dv.loyal order by random() limit 1;
    c := cats -> (array[0,0,2,3,1,9,4,0,2,10])[i];
    cat := c ->> 0;
    mk := (array['die','raf','raf','raf','rai','car','rai','die','raf','car'])[i];
    opened := now_ts - make_interval(mins => (400 - i * 30));
    started := null; done_at := null; req_at := null; appr_at := null; channel := null;
    if pipeline[i] in ('awaiting_approval', 'approved', 'in_progress', 'in_progress_paused', 'completed') and i <> 5 then
      req_at := opened + interval '20 minutes';
    end if;
    if pipeline[i] in ('approved', 'in_progress', 'in_progress_paused', 'completed') then
      appr_at := opened + interval '35 minutes'; channel := 'whatsapp';
    end if;
    if pipeline[i] in ('in_progress', 'in_progress_paused', 'completed') then started := opened + interval '50 minutes'; end if;
    if pipeline[i] = 'completed' then done_at := started + make_interval(mins => ((c ->> 2)::int)); end if;

    insert into service_orders (workshop_id, customer_id, vehicle_id, title, category, status, price, created_at,
      approval_requested_at, approved_at, approval_channel, started_at, completed_at, estimated_hours, workshop_mechanic_id, source)
    values (wid, cid, vid, c ->> 4, cat,
      (case when pipeline[i] = 'in_progress_paused' then 'in_progress' else pipeline[i] end)::os_status, 0, opened,
      req_at, appr_at, channel, started, done_at, (c ->> 3)::numeric, (mids ->> mk)::uuid, 'demo')
    returning id into osid;

    k := 0;
    for item in select x from jsonb_array_elements(c -> 5) x loop
      insert into service_order_items (service_order_id, kind, description, quantity, unit_price, position)
      values (osid, 'labor', item ->> 0, 1, round(((item ->> 1)::numeric + (item ->> 2)::numeric) / 10) * 5, k); k := k + 1;
    end loop;
    for item in select x from jsonb_array_elements(c -> 6) x loop
      insert into service_order_items (service_order_id, kind, description, quantity, unit_price, position)
      values (osid, 'part', item ->> 0, (item ->> 3)::numeric, floor(((item ->> 1)::numeric + (item ->> 2)::numeric) / 2) + 0.90, k); k := k + 1;
    end loop;

    if pipeline[i] = 'in_progress_paused' then
      insert into service_order_pauses (service_order_id, reason, started_at)
      values (osid, 'Aguardando peça', started + interval '70 minutes');
    end if;
  end loop;

  -- ── Afastamentos (relatório da equipe) ──────────────────────────────────
  -- Anderson afastado agora (atestado); histórico de férias, atestados e folga.
  insert into workshop_mechanic_absences (workshop_id, mechanic_id, reason, started_on, expected_return, returned_on, notes) values
    (wid, m_and, 'medical',  now_ts::date - 1,   now_ts::date + 2,   null,               'Atestado de 3 dias'),
    (wid, m_rai, 'medical',  now_ts::date - 19,  now_ts::date - 17,  now_ts::date - 17,  null),
    (wid, m_die, 'time_off', now_ts::date - 12,  now_ts::date - 11,  now_ts::date - 11,  'Banco de horas'),
    (wid, m_car, 'medical',  now_ts::date - 47,  now_ts::date - 45,  now_ts::date - 44,  null),
    (wid, m_raf, 'vacation', now_ts::date - 83,  now_ts::date - 70,  now_ts::date - 68,  'Férias de 15 dias'),
    (wid, m_and, 'vacation', now_ts::date - 174, now_ts::date - 144, now_ts::date - 144, 'Férias de 30 dias');
  update workshop_mechanics set status = 'away', active = false where id = m_and;
  -- ninguém trabalha nas próprias férias: OS desses períodos vão para outro colaborador
  update service_orders s set workshop_mechanic_id = case when a.mechanic_id = m_raf then m_rai else m_raf end
    from workshop_mechanic_absences a
   where a.workshop_id = wid and s.workshop_id = wid and s.workshop_mechanic_id = a.mechanic_id
     and s.created_at::date >= a.started_on and s.created_at::date < coalesce(a.returned_on, now_ts::date + 1);

  -- ── Numeração em ordem cronológica ───────────────────────────────────────
  update service_orders set number = number + 100000 where workshop_id = wid;
  update service_orders s set number = x.rn
    from (select id, row_number() over (order by created_at, id) rn from service_orders where workshop_id = wid) x
   where s.id = x.id;

  -- ── Vitrine (sem fotos: fica em ~70% para mostrar o "próximo passo") ─────
  insert into workshop_showcase (workshop_id, services, vehicle_types, brands, bays, lifts, equipment, amenities,
    customer_types, price_tier, service_area, hours, whatsapp, instagram, founded_year, payment_methods, warranty_days,
    highlights, certifications)
  values (wid,
    array['Troca de óleo','Revisão geral','Freios','Suspensão','Alinhamento','Balanceamento','Pneus','Embreagem','Motor','Injeção eletrônica','Elétrica','Ar-condicionado','Diagnóstico'],
    array['Carros de passeio','SUVs e picapes','Utilitários / vans'],
    array['Todas as marcas','Nacionais','Importados'],
    6, 4,
    array['Scanner automotivo','Alinhamento 3D','Balanceadora','Elevadores','Recarga de ar-condicionado','Limpeza de bicos','Teste de bateria'],
    array['Sala de espera','Wi-Fi','Café / água','Estacionamento','Leva e traz','Acompanhar o serviço por foto/vídeo'],
    array['Particulares','Motoristas de aplicativo','Frotas / empresas'],
    'intermediaria', 'Jardim Ângela, Capão Redondo, Parque do Lago, M''Boi Mirim e região — até 10 km',
    '{"mon":{"open":"08:00","close":"18:00"},"tue":{"open":"08:00","close":"18:00"},"wed":{"open":"08:00","close":"18:00"},"thu":{"open":"08:00","close":"18:00"},"fri":{"open":"08:00","close":"18:00"},"sat":{"open":"08:00","close":"12:00"},"sun":{"open":"","close":"","closed":true}}',
    '(11) 90000-0900', '@checkallautocenter', 2012,
    array['Pix','Dinheiro','Cartão de débito','Cartão de crédito','Parcelado no cartão','Faturado para empresas'], 90,
    'Oficina familiar desde 2012. Mostramos a peça trocada, damos 90 dias de garantia em todos os serviços e você acompanha tudo por foto no WhatsApp. Orçamento aprovado antes de mexer no carro — sem surpresa na conta.',
    'Equipe com cursos SENAI e Bosch')
  on conflict (workshop_id) do update set
    services = excluded.services, vehicle_types = excluded.vehicle_types, brands = excluded.brands, bays = excluded.bays,
    lifts = excluded.lifts, equipment = excluded.equipment, amenities = excluded.amenities, customer_types = excluded.customer_types,
    price_tier = excluded.price_tier, service_area = excluded.service_area, hours = excluded.hours, whatsapp = excluded.whatsapp,
    instagram = excluded.instagram, founded_year = excluded.founded_year, payment_methods = excluded.payment_methods,
    warranty_days = excluded.warranty_days, highlights = excluded.highlights, certifications = excluded.certifications;
end $$;
