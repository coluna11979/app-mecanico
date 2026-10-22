-- Perguntas salvas do agente, por categoria (o dono adiciona, edita e remove).
-- As iniciais vêm do template na primeira abertura (ai_agents.questions_seeded evita recriar as apagadas).

alter table public.ai_agents add column if not exists questions_seeded boolean not null default false;

create table if not exists public.ai_agent_questions (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.ai_agents(id) on delete cascade,
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  category    text not null check (length(trim(category)) > 0),
  question    text not null check (length(trim(question)) > 0 and length(question) <= 2000),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists ai_agent_questions_agent_idx on public.ai_agent_questions (agent_id, category, position);

alter table public.ai_agent_questions enable row level security;
drop policy if exists ai_agent_questions_owner on public.ai_agent_questions;
create policy ai_agent_questions_owner on public.ai_agent_questions for all
  using (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_owner(workshop_id, auth.uid()) or is_admin(auth.uid()));
