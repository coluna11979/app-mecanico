/**
 * Situação da demanda do MecânicoApp ligada a uma OS (jobs.service_order_id).
 * Mesma leitura das etapas da tela de acompanhamento (oficina/Tracking): só interpreta
 * os campos que o fluxo do marketplace já grava — não cria etapa nem regra nova.
 */
import type { Job } from '@/types/database';

export type PlatformJob = Pick<Job,
  'id' | 'status' | 'mechanic_id' | 'scheduled_at' | 'created_at' | 'accepted_at' | 'en_route_at' | 'arrived_at'
  | 'pix_paid_at' | 'started_at' | 'completed_at' | 'workshop_confirmed_at' | 'cancelled_at'>;

export type JobTone = 'wait' | 'move' | 'action' | 'done' | 'off';

export function platformJobStatus(j: PlatformJob): { label: string; tone: JobTone } {
  switch (j.status) {
    case 'cancelled': return { label: 'Cancelada', tone: 'off' };
    case 'disputed':  return { label: 'Em disputa', tone: 'action' };
    case 'open':      return { label: 'Aguardando aceite', tone: 'wait' };
    case 'in_progress': return { label: 'Em serviço', tone: 'move' };
    case 'completed':
      return j.workshop_confirmed_at
        ? { label: 'Concluído', tone: 'done' }
        : { label: 'Finalizou — aguardando sua confirmação', tone: 'action' };
  }
  // assigned: aceito, a caminho, chegou (pagamento), aguardando início
  if (j.started_at)  return { label: 'Em serviço', tone: 'move' };
  if (j.pix_paid_at) return { label: 'Pago — aguardando início', tone: 'move' };
  if (j.arrived_at)  return { label: 'Chegou — aguardando pagamento', tone: 'action' };
  if (j.en_route_at) return { label: 'A caminho', tone: 'move' };
  return { label: 'Aceito', tone: 'move' };
}

/** A demanda atual é a mais recente não cancelada; as demais ficam como histórico */
export function splitJobs<T extends PlatformJob>(jobs: T[]) {
  const sorted = [...jobs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const current = sorted.find(j => j.status !== 'cancelled') ?? null;
  return { current, history: sorted.filter(j => j !== current) };
}
