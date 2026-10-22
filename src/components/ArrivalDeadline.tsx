import { useEffect, useState } from 'react';
import type { Job } from '@/types/database';
import {
  arrivalDeadline, formatDeadline, formatRemaining, previewDeadline,
} from '@/lib/arrivalDeadline';

/** Re-renderiza periodicamente para a contagem regressiva andar. */
function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * ANTES do aceite — o mecânico fica ciente do prazo que vai assumir.
 * Tema escuro (telas do mecânico).
 */
export function AcceptDeadlineHint({ job, className = '' }: {
  job: Pick<Job, 'created_at' | 'scheduled_at'>;
  className?: string;
}) {
  useNow(30000);
  const deadline = previewDeadline(job);
  return (
    <div className={`text-[11px] text-steel-300 bg-steel-900/60 border border-steel-700 rounded-lg px-2.5 py-1.5 leading-snug ${className}`}>
      ⏱ {job.scheduled_at
        ? <>Chegue até <strong className="text-white">{formatDeadline(deadline)}</strong> (horário marcado + 30 min de tolerância).</>
        : <>Ao aceitar, você tem <strong className="text-white">45 min</strong> para chegar (até {formatDeadline(deadline)}).</>}
      {' '}Depois disso a oficina pode cancelar sem multa.
    </div>
  );
}

/**
 * DEPOIS do aceite — contagem regressiva até o prazo de chegada.
 * `tone="onBrand"` para cards laranja; padrão para fundo escuro.
 */
export function ArrivalCountdown({ job, tone = 'dark', className = '' }: {
  job: Job;
  tone?: 'dark' | 'onBrand';
  className?: string;
}) {
  const now = useNow();
  if (job.status !== 'assigned') return null;
  const deadline = arrivalDeadline(job);
  if (!deadline) return null;

  const left = deadline.getTime() - now;
  // Agendado para daqui a mais de 1 dia: ainda não precisa de contagem
  if (left > 24 * 60 * 60 * 1000) return null;

  if (left <= 0) {
    return (
      <div className={`text-xs font-semibold rounded-lg px-2.5 py-1.5 leading-snug ${
        tone === 'onBrand' ? 'bg-white text-alert-700' : 'bg-alert-500/15 text-alert-300 border border-alert-500/40'
      } ${className}`}>
        ⚠️ Prazo de chegada passou ({formatDeadline(deadline)}). A oficina pode cancelar sem multa — avise pelo chat se estiver chegando.
      </div>
    );
  }

  const urgent = left <= 10 * 60 * 1000;
  return (
    <div className={`text-xs rounded-lg px-2.5 py-1.5 leading-snug ${
      tone === 'onBrand'
        ? 'bg-white/15 text-white'
        : urgent
          ? 'bg-pending-500/15 text-pending-300 border border-pending-500/40'
          : 'bg-steel-900/60 text-steel-300 border border-steel-700'
    } ${className}`}>
      ⏱ Chegue até <strong>{formatDeadline(deadline)}</strong> · faltam <strong>{formatRemaining(left)}</strong>
    </div>
  );
}
