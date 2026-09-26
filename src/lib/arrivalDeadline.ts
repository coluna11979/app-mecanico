import type { Job } from '@/types/database';

/**
 * Prazo de chegada do mecânico.
 *
 * Se o mecânico aceitou e não chegou dentro do prazo, a oficina pode cancelar
 * SEM multa. A mesma regra está na Edge Function `cancel-job` (quem cobra de
 * verdade) — ao mudar aqui, mude lá também.
 *
 *  - Imediata: 45 min a partir do aceite
 *  - Agendada: 30 min após o horário marcado
 *  - Nunca menos que 45 min após o aceite (ex.: agendado pra daqui a 10 min)
 */
export const ACCEPT_TOLERANCE_MS     = 5  * 60 * 1000; // arrependimento logo após o aceite
export const IMMEDIATE_ARRIVAL_MS    = 45 * 60 * 1000;
export const SCHEDULED_ARRIVAL_GRACE = 30 * 60 * 1000;

type JobTimes = Pick<Job, 'created_at' | 'scheduled_at' | 'arrived_at' | 'mechanic_id'> & {
  accepted_at?: string | null;
};

/** Momento do aceite (jobs antigos, sem accepted_at, caem no created_at). */
export function acceptedAt(job: JobTimes): number {
  return new Date(job.accepted_at ?? job.created_at).getTime();
}

/** Até quando o mecânico precisa chegar. null = não se aplica (sem mecânico ou já chegou). */
export function arrivalDeadline(job: JobTimes): Date | null {
  if (!job.mechanic_id || job.arrived_at) return null;
  const immediate = acceptedAt(job) + IMMEDIATE_ARRIVAL_MS;
  if (job.scheduled_at) {
    const scheduled = new Date(job.scheduled_at).getTime() + SCHEDULED_ARRIVAL_GRACE;
    return new Date(Math.max(scheduled, immediate));
  }
  return new Date(immediate);
}

/** Prazo que o mecânico terá se aceitar AGORA (mostrado antes do aceite). */
export function previewDeadline(job: Pick<Job, 'created_at' | 'scheduled_at'>): Date {
  return arrivalDeadline({
    ...job, mechanic_id: 'preview', arrived_at: null, accepted_at: new Date().toISOString(),
  })!;
}

/** "faltam 23 min" / "faltam 1h 10min" */
export function formatRemaining(ms: number): string {
  const min = Math.max(0, Math.ceil(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

/** Mecânico passou do prazo sem chegar → oficina cancela sem multa. */
export function isArrivalLate(job: JobTimes, now = Date.now()): boolean {
  const d = arrivalDeadline(job);
  return !!d && now > d.getTime();
}

export function formatDeadline(d: Date): string {
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
