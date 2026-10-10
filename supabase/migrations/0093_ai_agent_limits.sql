-- Modelo e limites por agente — só o superadmin ajusta (vazio = padrão da plataforma).
--   model          modelo da Anthropic (vazio = ai_agent_model / ai_invoice_model de app_settings)
--   max_tokens     tamanho máximo da resposta (padrão 4000, até 16000)
--   history_window quantas mensagens anteriores o agente lembra (padrão 20, até 60)
--   max_tool_turns quantas voltas de consulta por pergunta (padrão 6, até 40)

alter table public.ai_agents
  add column if not exists model          text,
  add column if not exists max_tokens     integer check (max_tokens is null or max_tokens between 500 and 16000),
  add column if not exists history_window integer check (history_window is null or history_window between 2 and 60),
  add column if not exists max_tool_turns integer check (max_tool_turns is null or max_tool_turns between 1 and 40);

-- O dono edita o próprio agente (RLS), mas estes campos são só do superadmin:
-- quem não é admin não consegue alterá-los (nem pela API direta). A edge function (service role) passa.
create or replace function public.ai_agents_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin(auth.uid()) then
    if tg_op = 'INSERT' then
      new.model := null; new.max_tokens := null; new.history_window := null; new.max_tool_turns := null;
    else
      new.model := old.model; new.max_tokens := old.max_tokens;
      new.history_window := old.history_window; new.max_tool_turns := old.max_tool_turns;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.ai_agents_guard() from public, anon, authenticated;

drop trigger if exists ai_agents_guard on public.ai_agents;
create trigger ai_agents_guard before insert or update on public.ai_agents
  for each row execute function public.ai_agents_guard();

-- Aviso do linter: fixa o search_path da função de updated_at
create or replace function public.ai_agents_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
