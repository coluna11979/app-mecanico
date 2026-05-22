-- Marca o momento em que o mecânico SAIU para o serviço (deslocamento iniciado).
-- Permite separar jobs agendados (aceitos mas ainda não iniciados) dos jobs
-- ativos (a caminho / em execução).
--
-- Job imediato: en_route_at é setado no aceite (vai agora).
-- Job agendado: en_route_at fica null no aceite (vai pra Agenda) e só é
-- setado quando o mecânico toca "Estou indo" no dia.

alter table public.jobs add column if not exists en_route_at timestamptz;

-- Backfill: jobs já ativos preservam o comportamento atual (já estão "a caminho").
update public.jobs
set en_route_at = coalesce(arrived_at, started_at, created_at)
where status in ('assigned', 'in_progress')
  and en_route_at is null;
