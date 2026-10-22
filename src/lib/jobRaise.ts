import type { Job } from '@/types/database';
import { jobGross } from '@/lib/payment';

/** Por quanto tempo o mecânico vê o selo "Valor aumentou" */
export const RAISE_BADGE_MS = 24 * 60 * 60 * 1000;

/**
 * Valor (bruto) de antes, se a oficina aumentou a demanda nas últimas 24 h — senão null.
 * Quem marca é o banco (0130), que também toca o celular dos mecânicos.
 */
export function raisedFrom(j: Pick<Job, 'raised_at' | 'raised_from' | 'price_per_hour' | 'max_hours' | 'price'>, now = Date.now()): number | null {
  if (!j.raised_at || j.raised_from == null) return null;
  if (now - new Date(j.raised_at).getTime() > RAISE_BADGE_MS) return null;
  const from = Number(j.raised_from);
  return from > 0 && from < jobGross(j) ? from : null;
}
