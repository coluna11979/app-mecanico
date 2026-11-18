-- Diagnosticador: agente que só conversa (sem ferramentas) para guiar o diagnóstico até a causa raiz.
alter table public.ai_agents drop constraint if exists ai_agents_template_check;
alter table public.ai_agents add constraint ai_agents_template_check
  check (template in ('socio', 'recepcao', 'followup', 'posvenda', 'orcamento', 'admin_cadastros', 'diagnostico'));
