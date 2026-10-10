-- Agentes internos de IA (módulo opcional 'agentes', ligado pelo superadmin por oficina).
-- Fase 1: "Sócio operacional" — chat só para o DONO, só leitura.
-- A configuração do agente (prompt, tools) é do dono; a execução roda na edge function agent-chat,
-- que impõe o workshop_id em toda consulta. Custo/uso vai para ai_usage_log (feature 'agent_socio').

create table if not exists public.ai_agents (
  id            uuid primary key default gen_random_uuid(),
  workshop_id   uuid not null references public.workshops(id) on delete cascade,
  template      text not null check (template in ('socio')),
  name          text not null check (length(trim(name)) > 0),
  system_prompt text not null,
  /** Tools liberadas para este agente (chaves definidas na edge function agent-chat) */
  tools         text[] not null default '{}',
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workshop_id, template)
);

create table if not exists public.ai_agent_messages (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.ai_agents(id) on delete cascade,
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists ai_agent_messages_agent_idx on public.ai_agent_messages (agent_id, created_at);

alter table public.ai_agents enable row level security;
alter table public.ai_agent_messages enable row level security;

-- Só o dono da oficina (ou o superadmin) vê e configura; operadores de PIN não passam por aqui
drop policy if exists ai_agents_owner on public.ai_agents;
create policy ai_agents_owner on public.ai_agents for all
  using (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()));

-- Mensagens: o dono lê e pode limpar o histórico; quem escreve é a edge function (service role)
drop policy if exists ai_agent_messages_read on public.ai_agent_messages;
create policy ai_agent_messages_read on public.ai_agent_messages for select
  using (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()));
drop policy if exists ai_agent_messages_clear on public.ai_agent_messages;
create policy ai_agent_messages_clear on public.ai_agent_messages for delete
  using (is_workshop_owner(workshop_id, auth.uid()));

create or replace function public.ai_agents_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists ai_agents_touch on public.ai_agents;
create trigger ai_agents_touch before update on public.ai_agents
  for each row execute function public.ai_agents_touch();
