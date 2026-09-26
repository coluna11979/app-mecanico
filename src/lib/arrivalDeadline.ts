import type { Job } from '@/types/database';

/**
 * Prazo de chegada do mecânico.
 *
 * Se o mecânico aceitou e não chegou dentro do prazo, a oficina pode cancelar
 * SEM multa. A mesma regra está na Edge Function `cancel-job` (quem cobra de
 * verdade) — ao mudar aqui, mude lá também.
 *
 *  - Imediata: 45 min a partir do aceite
 *  - Agendada: 30 min após o horário marcado (ou após o aceite, se aceitou atrasado)
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
  const accepted = acceptedAt(job);
  if (job.scheduled_at) {
    const base = Math.max(new Date(job.scheduled_at).getTime(), accepted);
    return new Date(base + SCHEDULED_ARRIVAL_GRACE);
  }
  return new Date(accepted + IMMEDIATE_ARRIVAL_MS);
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
