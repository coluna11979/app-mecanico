-- Rascunho + versões publicadas dos agentes de IA.
--
-- ai_agents.name / system_prompt / tools continuam sendo a versão PUBLICADA (a que o chat do Sócio
-- e a Recepção do WhatsApp usam). O que o dono edita sem publicar fica em ai_agents.draft e só
-- vira publicado em ai_agent_publish(). Cada publicação guarda um retrato em ai_agent_versions
-- (dá para restaurar uma versão antiga: ela volta como rascunho e é publicada de novo).

alter table public.ai_agents
  add column if not exists draft   jsonb,                         -- {name, system_prompt, tools} ainda não publicados
  add column if not exists version integer not null default 1;    -- número da versão publicada

create table if not exists public.ai_agent_versions (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.ai_agents(id) on delete cascade,
  workshop_id   uuid not null references public.workshops(id) on delete cascade,
  version       integer not null,
  name          text not null,
  system_prompt text not null,
  tools         text[] not null default '{}',
  note          text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (agent_id, version)
);
create index if not exists ai_agent_versions_agent_idx on public.ai_agent_versions (agent_id, version desc);

alter table public.ai_agent_versions enable row level security;
-- Só leitura pelo dono/superadmin; quem grava é a função ai_agent_publish (security definer)
drop policy if exists ai_agent_versions_read on public.ai_agent_versions;
create policy ai_agent_versions_read on public.ai_agent_versions for select
  using (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()));

-- Versão 1 de cada agente que já existe (o estado atual)
insert into public.ai_agent_versions (agent_id, workshop_id, version, name, system_prompt, tools, note)
select id, workshop_id, version, name, system_prompt, tools, 'Versão inicial'
from public.ai_agents
on conflict (agent_id, version) do nothing;

/** Publica o rascunho: ele vira a versão ativa do agente e fica registrado no histórico. */
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
  if not (is_workshop_owner(a.workshop_id, auth.uid()) or is_admin(auth.uid())) then
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
