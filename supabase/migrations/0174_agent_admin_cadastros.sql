-- Agente do ADMIN da plataforma: "Acompanhante de cadastros".
-- Acompanha o funil de cadastro (mecânicos e oficinas): quem terminou, quem falta o quê, quem precisa mandar documentos,
-- e prepara os e-mails (lembretes individuais e campanhas) para o admin aprovar no chat.
--
--  · agente de plataforma: ai_agents/messages/questions/versions passam a aceitar workshop_id nulo
--    (template 'admin_cadastros', um só; só o admin enxerga, pelas regras que já existem: is_admin)
--  · adm_funnel_base/summary/list/detail: leitura do funil (só service_role; a edge function confere que quem chama é admin)

alter table public.ai_agents          alter column workshop_id drop not null;
alter table public.ai_agent_messages  alter column workshop_id drop not null;
alter table public.ai_agent_questions alter column workshop_id drop not null;
alter table public.ai_agent_versions  alter column workshop_id drop not null;

alter table public.ai_agents drop constraint if exists ai_agents_template_check;
alter table public.ai_agents add constraint ai_agents_template_check
  check (template in ('socio', 'recepcao', 'followup', 'posvenda', 'orcamento', 'admin_cadastros'));

-- Só um agente de plataforma por tipo (a unique (workshop_id, template) não pega nulos)
create unique index if not exists ai_agents_platform_template_uidx on public.ai_agents (template) where workshop_id is null;

-- Agente de plataforma só pode ser do admin
alter table public.ai_agents drop constraint if exists ai_agents_platform_only_admin;
alter table public.ai_agents add constraint ai_agents_platform_only_admin
  check (workshop_id is not null or template = 'admin_cadastros');

create or replace function public.ai_agent_publish(p_agent uuid, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  a ai_agents%rowtype;
  d_name text; d_prompt text; d_tools text[];
  new_version integer;
begin
  select * into a from ai_agents where id = p_agent for update;
  if not found then raise exception 'Agente não encontrado'; end if;
  if not ((a.workshop_id is not null and is_workshop_owner(a.workshop_id, auth.uid())) or is_admin(auth.uid())) then
    raise exception 'Sem permissão';
  end if;
  if a.draft is null then raise exception 'Não há rascunho para publicar'; end if;

  d_name   := nullif(btrim(a.draft->>'name'), '');
  d_prompt := nullif(btrim(a.draft->>'system_prompt'), '');
  if d_name is null or d_prompt is null then raise exception 'Nome e instruções são obrigatórios'; end if;
  d_tools := coalesce(array(select jsonb_array_elements_text(coalesce(a.draft->'tools', '[]'::jsonb))), '{}');

  new_version := a.version + 1;
  update ai_agents
     set name = d_name, system_prompt = d_prompt, tools = d_tools, draft = null, version = new_version
   where id = a.id;

  insert into ai_agent_versions (agent_id, workshop_id, version, name, system_prompt, tools, note, created_by)
  values (a.id, a.workshop_id, new_version, d_name, d_prompt, d_tools, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());

  return new_version;
end $$;
revoke all on function public.ai_agent_publish(uuid, text) from public, anon;
grant execute on function public.ai_agent_publish(uuid, text) to authenticated;

/* ── Funil de cadastro ─────────────────────────────────────────────────────── */

-- Uma linha por cadastro (mecânico ou oficina) com o que falta, documentos e quem deve a próxima ação
create or replace function public.adm_funnel_base()
returns table (
  profile_id uuid, tipo text, nome text, status text, cadastrado_em timestamptz, telefone text,
  cidade text, estado text, faltando text[], docs_pedidos integer, ultimo_pedido timestamptz,
  respostas integer, ultima_resposta timestamptz, anexos integer, ultima_atividade timestamptz,
  verificacao text, tem_email boolean, estagio text, dias_parado integer
)
language sql
stable
security definer
set search_path = public
as $$
  with msgs as (
    select m.profile_id,
           count(*) filter (where m.kind = 'request_documents') docs_pedidos,
           max(m.created_at) filter (where m.kind = 'request_documents') ultimo_pedido,
           count(*) filter (where m.sender_role = 'user') respostas,
           max(m.created_at) filter (where m.sender_role = 'user') ultima_resposta,
           count(*) filter (where m.sender_role = 'user' and m.attachment_path is not null) anexos,
           max(m.created_at) ultima_msg
      from approval_messages m group by m.profile_id
  ), base as (
    select p.id, p.role, p.full_name, p.status, p.created_at, p.phone, p.last_seen_at,
           coalesce(m.city, w.city) cidade, coalesce(m.state, w.state) estado,
           array_remove(array[
             case when p.role = 'mechanic' and btrim(coalesce(m.cpf, '')) = '' then 'CPF' end,
             case when p.role = 'mechanic' and btrim(coalesce(m.cnh, '')) = '' then 'CNH' end,
             case when p.role = 'mechanic' and btrim(coalesce(m.pix_key, '')) = '' then 'chave PIX' end,
             case when p.role = 'mechanic' and btrim(coalesce(m.address, '')) = '' then 'endereço' end,
             case when p.role = 'mechanic' and m.birth_date is null then 'data de nascimento' end,
             case when p.role = 'mechanic' and btrim(coalesce(m.mother_name, '')) = '' then 'nome da mãe' end,
             case when p.role = 'workshop' and btrim(coalesce(w.cnpj, '')) = '' then 'CNPJ' end,
             case when p.role = 'workshop' and btrim(coalesce(w.address, '')) = '' then 'endereço' end,
             case when btrim(coalesce(p.phone, '')) = '' then 'telefone' end
           ], null) faltando,
           coalesce(g.docs_pedidos, 0)::int docs_pedidos, g.ultimo_pedido, coalesce(g.respostas, 0)::int respostas,
           g.ultima_resposta, coalesce(g.anexos, 0)::int anexos,
           greatest(p.created_at, g.ultima_msg) ultima_atividade,
           (select v.check_type || ': ' || v.status from mechanic_verifications v where v.mechanic_id = m.id order by v.created_at desc limit 1) verificacao,
           exists (select 1 from auth.users u where u.id = p.id and u.email is not null) tem_email
      from profiles p
      left join mechanics m on m.profile_id = p.id and p.role = 'mechanic'
      left join workshops w on w.profile_id = p.id and p.role = 'workshop'
      left join msgs g on g.profile_id = p.id
     where p.role in ('mechanic', 'workshop')
  )
  select b.id, b.role, b.full_name, b.status, b.created_at, b.phone, b.cidade, b.estado, b.faltando,
         b.docs_pedidos, b.ultimo_pedido, b.respostas, b.ultima_resposta, b.anexos, b.ultima_atividade,
         b.verificacao, b.tem_email,
         case
           when b.status = 'approved' then 'aprovado'
           when b.status = 'rejected' then 'rejeitado'
           when b.status = 'awaiting_region' then 'em_espera_regiao'
           when b.docs_pedidos > 0 and (b.ultima_resposta is null or b.ultima_resposta < b.ultimo_pedido) then 'aguardando_cliente'
           when b.respostas > 0 and (b.ultimo_pedido is null or b.ultima_resposta >= b.ultimo_pedido) then 'respondeu_aguardando_analise'
           when cardinality(b.faltando) > 0 then 'cadastro_incompleto'
           else 'aguardando_analise'
         end,
         greatest(0, floor(extract(epoch from (now() - coalesce(b.ultima_atividade, b.created_at))) / 86400))::int
    from base b;
$$;

create or replace function public.adm_funnel_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('ok', true,
    'por_tipo_e_status', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'status', status, 'total', n) order by tipo, status), '[]'::jsonb)
                            from (select tipo, status, count(*) n from adm_funnel_base() group by 1, 2) t),
    'em_andamento_por_estagio', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'estagio', estagio, 'total', n,
                                        'parados_mais_de_7_dias', parados) order by tipo, estagio), '[]'::jsonb)
                            from (select tipo, estagio, count(*) n, count(*) filter (where dias_parado > 7) parados
                                    from adm_funnel_base() where estagio not in ('aprovado', 'rejeitado') group by 1, 2) t),
    'sem_email', (select count(*) from adm_funnel_base() where not tem_email and estagio not in ('aprovado', 'rejeitado')));
$$;

create or replace function public.adm_funnel_list(
  p_tipo text default null, p_estagio text default null, p_busca text default null,
  p_min_dias integer default null, p_limit integer default 30, p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lim integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_q   text := btrim(orc_norm(coalesce(p_busca, '')));
  v_total integer;
  v_rows jsonb;
begin
  select count(*) into v_total from adm_funnel_base() b
   where (p_tipo is null or b.tipo = p_tipo)
     and (case when p_estagio is null then b.estagio not in ('aprovado', 'rejeitado') else b.estagio = p_estagio end)
     and (p_min_dias is null or b.dias_parado >= p_min_dias)
     and (v_q = '' or orc_norm(coalesce(b.nome, '') || ' ' || coalesce(b.telefone, '') || ' ' || coalesce(b.cidade, '')) like '%' || v_q || '%');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.dias_parado desc, x.nome), '[]'::jsonb) into v_rows from (
    select b.profile_id as perfil_id, b.nome, b.tipo, b.status, b.estagio, b.dias_parado, b.cadastrado_em, b.telefone, b.cidade, b.estado,
           b.faltando, b.docs_pedidos, b.ultimo_pedido, b.respostas, b.anexos, b.verificacao, b.tem_email
      from adm_funnel_base() b
     where (p_tipo is null or b.tipo = p_tipo)
       and (case when p_estagio is null then b.estagio not in ('aprovado', 'rejeitado') else b.estagio = p_estagio end)
       and (p_min_dias is null or b.dias_parado >= p_min_dias)
       and (v_q = '' or orc_norm(coalesce(b.nome, '') || ' ' || coalesce(b.telefone, '') || ' ' || coalesce(b.cidade, '')) like '%' || v_q || '%')
     order by b.dias_parado desc, b.nome
     limit v_lim offset v_off) x;
  return jsonb_build_object('ok', true, 'total', v_total, 'proximo_offset', v_off + v_lim, 'cadastros', v_rows);
end $$;

create or replace function public.adm_funnel_detail(p_profile uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r jsonb;
begin
  select to_jsonb(x) into r from (
    select b.profile_id as perfil_id, b.nome, b.tipo, b.status, b.estagio, b.dias_parado, b.cadastrado_em, b.telefone, b.cidade, b.estado,
           b.faltando, b.docs_pedidos, b.ultimo_pedido, b.respostas, b.ultima_resposta, b.anexos, b.verificacao, b.tem_email, b.ultima_atividade,
           (select p.admin_notes from profiles p where p.id = b.profile_id) notas_do_admin
      from adm_funnel_base() b where b.profile_id = p_profile) x;
  if r is null then return jsonb_build_object('ok', false, 'error', 'cadastro_nao_encontrado'); end if;
  return jsonb_build_object('ok', true, 'cadastro', r, 'mensagens', (
    select coalesce(jsonb_agg(jsonb_build_object('tipo', m.kind, 'de', m.sender_role, 'texto', left(m.content, 300),
                                                 'anexo', m.attachment_path is not null, 'em', m.created_at) order by m.created_at desc), '[]'::jsonb)
      from (select * from approval_messages where profile_id = p_profile order by created_at desc limit 10) m));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'adm_funnel_base()', 'adm_funnel_summary()', 'adm_funnel_list(text,text,text,integer,integer,integer)', 'adm_funnel_detail(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
