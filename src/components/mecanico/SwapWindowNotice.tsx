import { swapWindowEndsAt, useCountdown } from '@/components/marketplace/AcceptedMechanic';
import { IconCheck, IconClock } from '@/components/mecanico/icons';
import { isAdvanceScheduled } from '@/lib/arrivalDeadline';
import type { Job } from '@/types/database';

/**
 * Mecânico que acabou de aceitar: a oficina tem 5 min para confirmar ou trocar.
 * Mostra quanto falta para ele não sair de casa à toa; some quando a oficina confirma ou o tempo acaba.
 */
export function SwapWindowNotice({ job, onBrand = false, className = '' }: { job: Job; onBrand?: boolean; className?: string }) {
  const end = swapWindowEndsAt(job);
  const { left, label, long } = useCountdown(end);

  if (job.workshop_approved_at && !job.arrived_at && job.status === 'assigned') {
    return (
      <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${onBrand ? 'bg-white/20 text-white' : 'bg-signal-500/15 text-signal-300'} ${className}`}>
        <IconCheck className="w-4 h-4 shrink-0" />A oficina confirmou você. Pode sair.
      </div>
    );
  }
  if (!end || left <= 0) return null;
  return (
    <div className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${onBrand ? 'bg-white/20 text-white' : 'bg-pending-500/15 text-pending-200'} ${className}`}>
      <IconClock className="w-4 h-4 mt-0.5 shrink-0" />
      {isAdvanceScheduled(job) ? (
        <span>
          Demanda agendada: a oficina pode trocar de mecânico {long ? '' : 'por mais '}<strong className="tabular-nums">{label}</strong> (2h antes do horário).
          Espere a confirmação dela antes de sair.
        </span>
      ) : (
        <span>
          A oficina pode trocar de mecânico por mais <strong className="tabular-nums">{label}</strong>.
          Espere esse tempo (ou a confirmação dela) antes de sair.
        </span>
      )}
    </div>
  );
}

/** Antes do aceite: avisa que existe a janela de troca da oficina (5 min; agendada: até 2h antes do horário) */
export function SwapWindowHint({ job }: { job?: Pick<Job, 'scheduled_at' | 'created_at'> }) {
  const scheduled = !!job?.scheduled_at
    && new Date(job.scheduled_at).getTime() - Date.now() > 60 * 60 * 1000;
  return (
    <p className="text-xs text-steel-400 leading-snug">
      {scheduled
        ? 'Depois que você aceitar, a oficina pode trocar de mecânico até 2h antes do horário. Espere a confirmação antes de sair.'
        : 'Depois que você aceitar, a oficina tem até 5 min para confirmar. Espere a confirmação antes de sair.'}
    </p>
  );
}
