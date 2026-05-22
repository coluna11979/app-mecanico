import type { Job } from '@/types/database';

/**
 * Um job é "agendado" quando tem data marcada no futuro.
 * Margem de 30 min: se faltam menos de 30 min (ou já passou), tratamos como
 * imediato — não faz sentido jogar pra Agenda algo que é praticamente agora.
 */
export function isScheduled(job: Pick<Job, 'scheduled_at'>): boolean {
  if (!job.scheduled_at) return false;
  const when = new Date(job.scheduled_at).getTime();
  return when - Date.now() > 30 * 60 * 1000;
}

/** Formata a data agendada de forma legível: "Sex, 23 mai · 14:00". */
export function formatScheduled(scheduledAt: string): string {
  return new Date(scheduledAt).toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
