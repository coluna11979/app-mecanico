import { useEffect, useState } from 'react';
import { fmtDur, openPause, pausedMinutes, workedMinutes } from './osHelpers';
import type { ServiceOrderPause } from '@/types/database';

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Tempo que o mecânico levou no serviço: do "Iniciar" ao "Concluir", descontando as pausas
 * (ex.: aguardando peça). Em andamento → cronômetro ao vivo; concluído → trabalhado vs. estimado.
 */
export default function ServiceTimer({ startedAt, completedAt, pauses, estimatedHours, mechanicName, compact = false }: {
  startedAt: string | null;
  completedAt: string | null;
  pauses?: ServiceOrderPause[] | null;
  estimatedHours?: number | null;
  mechanicName?: string | null;
  compact?: boolean;
}) {
  const running = !!startedAt && !completedAt;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, [running]);

  if (!startedAt) return null;
  const worked = workedMinutes(startedAt, completedAt, pauses) ?? 0;
  const paused = pausedMinutes(pauses, completedAt);
  const current = running ? openPause(pauses) : null;
  const pausedNow = current ? Math.round((Date.now() - new Date(current.started_at).getTime()) / 60000) : 0;
  const est = estimatedHours ? Math.round(Number(estimatedHours) * 60) : null;
  const diff = est != null ? worked - est : null;
  const over = diff != null && diff > 0;

  if (compact) {
    if (current) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-pending-800">
          ⏸ Pausado · {current.reason.toLowerCase()} há {fmtDur(pausedNow)}
        </span>
      );
    }
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${running ? 'text-brand-700' : 'text-steel-500'}`}>
        ⏱ {running ? `trabalhando · ${fmtDur(worked)}` : `${fmtDur(worked)} trabalhados`}
      </span>
    );
  }

  const tone = current ? 'bg-pending-50 border-pending-200' : running ? 'bg-brand-50 border-brand-200' : 'bg-steel-50 border-steel-200';

  return (
    <div className={`mt-4 rounded-xl px-4 py-3 border ${tone}`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <span className={`text-xl ${running && !current ? 'animate-pulse' : ''}`}>{current ? '⏸' : '⏱'}</span>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">
              {current ? 'Serviço pausado' : running ? 'Tempo trabalhado' : 'Tempo trabalhado no serviço'}
            </div>
            <div className={`text-2xl font-bold font-display leading-none ${current ? 'text-pending-800' : running ? 'text-brand-700' : 'text-steel-900'}`}>
              {fmtDur(worked)}
            </div>
          </div>
        </div>

        {current && (
          <div className="text-sm text-pending-800 font-semibold">
            {current.reason} · parado há {fmtDur(pausedNow)}
          </div>
        )}
        {mechanicName && <div className="text-sm text-steel-600">🔧 {mechanicName}</div>}
        {est != null && (
          <div className={`text-sm ${over ? 'text-alert-600' : 'text-signal-700'}`}>
            previsto {fmtDur(est)} · {diff === 0 ? 'no tempo' : over ? `${fmtDur(diff!)} a mais` : `${fmtDur(-diff!)} a menos`}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-steel-500">
        <span>início {fmtWhen(startedAt)}</span>
        {completedAt && <span>fim {fmtWhen(completedAt)}</span>}
        {paused > 0 && <span>⏸ pausas: {fmtDur(paused)} ({(pauses ?? []).length}x)</span>}
        {paused > 0 && <span>total do início ao fim: {fmtDur(worked + paused)}</span>}
      </div>
    </div>
  );
}
