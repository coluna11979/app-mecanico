-- Memória dos agentes: regras e preferências que o dono ensina no chat ("pneu se lança um por um, com custo unitário").
-- O agente salva pela ferramenta memoria_salvar (edge function agent-chat, service_role) e lê tudo a cada conversa.
-- O dono vê, apaga ou escreve memórias em ⚙️ Configurar. Agente da plataforma (workshop_id nulo): só o admin.

create table if not exists public.ai_agent_memories (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.ai_agents(id) on delete cascade,
  workshop_id uuid references public.workshops(id) on delete cascade,
  content     text not null check (length(btrim(content)) between 3 and 500),
  source      text not null default 'agente' check (source in ('agente', 'dono')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists ai_agent_memories_agent_idx on public.ai_agent_memories (agent_id, created_at);

alter table public.ai_agent_memories enable row level security;
drop policy if exists ai_agent_memories_owner on public.ai_agent_memories;
create policy ai_agent_memories_owner on public.ai_agent_memories for all
  using (public.is_workshop_owner(workshop_id, auth.uid()) or public.is_admin(auth.uid()))
  with check (public.is_workshop_owner(workshop_id, auth.uid()) or public.is_admin(auth.uid()));
grant select, insert, delete on public.ai_agent_memories to authenticated;
