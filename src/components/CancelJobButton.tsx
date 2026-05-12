import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Job } from '@/types/database';

interface Props {
  job: Job;
  onCancelled?: () => void;
  /** Estilo do botão: 'link' (texto pequeno), 'button' (botão completo) */
  variant?: 'link' | 'button';
  className?: string;
}

const TOLERANCE_MS = 5 * 60 * 1000;
const FEE_PCT = 0.30;

interface Cancellation {
  scenario: 'open' | 'tolerance' | 'after_tolerance' | 'arrived_unpaid' | 'paid' | 'blocked';
  title: string;
  message: string;
  fee: number;
  refund: number;
}

function analyseJob(job: Job): Cancellation | null {
  if (job.status === 'completed' || job.status === 'cancelled') {
    return { scenario: 'blocked', title: '', message: '', fee: 0, refund: 0 };
  }
  if (job.status === 'in_progress') {
    return null; // Em andamento → sem opção (vira disputa)
  }
  const cap = (job.price_per_hour ?? 0) * (job.max_hours ?? 1);
  const fee = Number((cap * FEE_PCT).toFixed(2));

  if (!job.mechanic_id || job.status === 'open') {
    return { scenario: 'open', title: 'Cancelar demanda',
      message: 'Demanda ainda não foi aceita por nenhum mecânico. Cancelamento sem custo.',
      fee: 0, refund: 0 };
  }
  if (job.status === 'assigned' && !job.arrived_at) {
    const elapsed = Date.now() - new Date(job.created_at).getTime();
    if (elapsed <= TOLERANCE_MS) {
      return { scenario: 'tolerance', title: 'Cancelar dentro da tolerância',
        message: 'Mecânico aceitou há menos de 5 minutos — cancelamento sem multa.',
        fee: 0, refund: 0 };
    }
    return { scenario: 'after_tolerance', title: `Cancelar com multa de R$ ${fee.toFixed(2)}`,
      message: `Mecânico aceitou há mais de 5 min. Multa de 30% (R$ ${fee.toFixed(2)}) ficará registrada como pendente.`,
      fee, refund: 0 };
  }
  if (job.arrived_at && !job.pix_paid_at) {
    return { scenario: 'arrived_unpaid', title: `Cancelar com multa de R$ ${fee.toFixed(2)}`,
      message: `Mecânico já chegou. Multa de 30% (R$ ${fee.toFixed(2)}) ficará registrada como pendente.`,
      fee, refund: 0 };
  }
  if (job.pix_paid_at && job.status === 'assigned') {
    const refund = Number((cap - fee).toFixed(2));
    return { scenario: 'paid', title: 'Cancelar com estorno parcial',
      message: `Pagamento já feito. Estorno de R$ ${refund.toFixed(2)} (70%) será aplicado e a plataforma retém R$ ${fee.toFixed(2)} (30%).`,
      fee, refund };
  }
  return null;
}

export function CancelJobButton({ job, onCancelled, variant = 'link', className = '' }: Props) {
  const [open, setOpen]         = useState(false);
  const [reason, setReason]     = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const cancellation = analyseJob(job);
  if (!cancellation || cancellation.scenario === 'blocked') return null;

  async function confirm() {
    if (!reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-job', {
        body: { job_id: job.id, reason: reason.trim(), cancelled_by: 'workshop' },
      });
      if (error || data?.error) {
        setError(data?.error ?? error?.message ?? 'Erro ao cancelar');
        setBusy(false);
        return;
      }
      setBusy(false);
      setOpen(false);
      onCancelled?.();
    } catch (e: any) {
      setError(e?.message ?? 'Erro de conexão');
      setBusy(false);
    }
  }

  function openModal(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
    setReason('');
    setError(null);
  }

  const feeChip = cancellation.fee > 0 && (
    <span className="ml-1 inline-flex items-center gap-1 bg-alert-500/15 text-alert-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">
      ⚠️ multa R$ {cancellation.fee.toFixed(0)}
    </span>
  );

  const trigger = variant === 'button' ? (
    <button onClick={openModal}
      className={`btn-ghost text-xs border border-alert-200 text-alert-700 hover:bg-alert-500/5 ${className}`}>
      🚫 Cancelar demanda{feeChip}
    </button>
  ) : (
    <button onClick={openModal}
      className={`text-xs text-steel-400 hover:text-alert-600 underline-offset-2 hover:underline ${className}`}>
      Cancelar demanda{feeChip}
    </button>
  );

  return (
    <>
      {trigger}

      {open && (
        <div
          className="fixed inset-0 bg-steel-900/80 grid place-items-center p-4 z-[60]"
          onClick={() => !busy && setOpen(false)}
        >
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="text-3xl shrink-0">🚫</span>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-steel-900">{cancellation.title}</h3>
                <p className="text-sm text-steel-600 mt-1 leading-relaxed">{cancellation.message}</p>
                <p className="text-xs text-steel-500 mt-2 truncate"><strong>Demanda:</strong> {job.title}</p>
              </div>
            </div>

            {cancellation.fee > 0 && (
              <div className="bg-pending-500/10 border border-pending-300 rounded-xl px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-steel-700">Valor original</span>
                  <span className="font-semibold">R$ {(((job.price_per_hour ?? 0) * (job.max_hours ?? 1))).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-alert-700 font-semibold mt-1">
                  <span>Multa (30%)</span>
                  <span>− R$ {cancellation.fee.toFixed(2)}</span>
                </div>
                {cancellation.refund > 0 && (
                  <div className="flex items-center justify-between text-signal-700 font-bold mt-2 pt-2 border-t border-pending-300">
                    <span>Você recebe (estorno)</span>
                    <span>R$ {cancellation.refund.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-steel-500 uppercase tracking-wider mb-1 block">
                Motivo do cancelamento *
              </label>
              <textarea
                className="input text-sm resize-none"
                rows={3}
                placeholder="Ex.: cliente desistiu, engano na publicação, etc."
                value={reason}
                onChange={e => setReason(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </div>

            {error && (
              <div className="text-sm text-alert-700 bg-alert-50 rounded-lg px-3 py-2">⚠️ {error}</div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => setOpen(false)} disabled={busy} className="btn-ghost flex-1">
                Voltar
              </button>
              <button
                onClick={confirm}
                disabled={busy || !reason.trim()}
                className="btn-ghost flex-1 border border-alert-500 text-alert-700 disabled:opacity-50"
              >
                {busy ? 'Cancelando…' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
