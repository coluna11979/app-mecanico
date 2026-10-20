import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Job } from '@/types/database';
import { formatBRL } from '@/lib/payment';
import { toast } from '@/components/ui/Toast';
import { ACCEPT_TOLERANCE_MS, acceptedAt, arrivalDeadline, formatDeadline, isArrivalLate } from '@/lib/arrivalDeadline';

interface Props {
  job: Job;
  onCancelled?: () => void;
  /** "Ninguém aceitou? Aumente o valor": abre a edição da demanda em vez de cancelar */
  onEdit?: () => void;
  /** Estilo do botão: 'link' (texto pequeno), 'button' (botão completo) */
  variant?: 'link' | 'button';
  className?: string;
}

const FEE_PCT = 0.30;

interface Cancellation {
  scenario: 'open' | 'tolerance' | 'late_arrival' | 'after_tolerance' | 'arrived_unpaid' | 'paid' | 'blocked';
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
    return { scenario: 'open', title: 'Cancelar anúncio',
      message: 'Nenhum mecânico aceitou ainda. Cancelar o anúncio não tem custo.',
      fee: 0, refund: 0 };
  }
  if (job.status === 'assigned' && !job.arrived_at) {
    const elapsed = Date.now() - acceptedAt(job);
    if (elapsed <= ACCEPT_TOLERANCE_MS) {
      return { scenario: 'tolerance', title: 'Cancelar dentro da tolerância',
        message: 'Mecânico aceitou há menos de 5 minutos — cancelamento sem multa.',
        fee: 0, refund: 0 };
    }
    if (isArrivalLate(job)) {
      return { scenario: 'late_arrival', title: 'Cancelar sem multa — mecânico atrasado',
        message: `O mecânico não chegou até ${formatDeadline(arrivalDeadline(job)!)}, o prazo de chegada. Você pode cancelar sem multa.`,
        fee: 0, refund: 0 };
    }
    const deadline = arrivalDeadline(job);
    return { scenario: 'after_tolerance', title: `Cancelar com multa de R$ ${formatBRL(fee)}`,
      message: `Mecânico aceitou há mais de 5 min. Multa de 30% (R$ ${formatBRL(fee)}) ficará registrada como pendente.`
        + (deadline ? ` Se ele não chegar até ${formatDeadline(deadline)}, você poderá cancelar sem multa.` : ''),
      fee, refund: 0 };
  }
  if (job.arrived_at && !job.pix_paid_at) {
    return { scenario: 'arrived_unpaid', title: `Cancelar com multa de R$ ${formatBRL(fee)}`,
      message: `Mecânico já chegou. Multa de 30% (R$ ${formatBRL(fee)}) ficará registrada como pendente.`,
      fee, refund: 0 };
  }
  if (job.pix_paid_at && job.status === 'assigned') {
    const refund = Number((cap - fee).toFixed(2));
    return { scenario: 'paid', title: 'Cancelar com estorno parcial',
      message: `Pagamento já feito. Estorno de R$ ${formatBRL(refund)} (70%) será aplicado e a plataforma retém R$ ${formatBRL(fee)} (30%).`,
      fee, refund };
  }
  return null;
}

/** Motivos rápidos (um toque); "Outro" pede texto */
const REASONS = ['Ninguém aceitou', 'Demorou demais', 'Cliente desistiu', 'Vou fazer com a equipe', 'Publiquei errado', 'Outro'] as const;
type Linked = { osNumbers: string[]; osItems: number; free: number };

export function CancelJobButton({ job, onCancelled, onEdit, variant = 'link', className = '' }: Props) {
  const [open, setOpen]         = useState(false);
  const [reasonKey, setReasonKey] = useState<string>('');
  const [reason, setReason]     = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  /** Serviços ligados ao anúncio (da OS e empilhados avulsos) e para onde voltam */
  const [linked, setLinked]     = useState<Linked | null>(null);
  /** pilha = volta/guarda nos Empilhados · equipe = a loja faz · nada = só cancela (demanda direta) */
  const [dest, setDest]         = useState<'pilha' | 'equipe' | 'nada'>('pilha');

  const cancellation = analyseJob(job);
  if (!cancellation || cancellation.scenario === 'blocked') return null;
  const isAd = cancellation.scenario === 'open';
  const fullReason = reasonKey === 'Outro' ? reason.trim() : [reasonKey, reason.trim()].filter(Boolean).join(' — ');
  const canConfirm = !!fullReason && (reasonKey !== 'Outro' || !!reason.trim());
  const hasLinked = !!linked && (linked.osItems > 0 || linked.free > 0);
  /** Demanda criada direto (sem OS nem empilhado): pode ser guardada nos Empilhados para depois */
  const direct = isAd && !!linked && !hasLinked;

  async function loadLinked() {
    const [os, free] = await Promise.all([
      supabase.from('service_order_items').select('id, service_order_id, so:service_orders(number)').eq('platform_job_id', job.id),
      supabase.from('stacked_services').select('id').eq('job_id', job.id),
    ]);
    const rows = (os.data ?? []) as unknown as { service_order_id: string; so: { number: number | null } | null }[];
    const nums = [...new Set(rows.map(r => (r.so?.number != null ? String(r.so.number).padStart(4, '0') : null)).filter((x): x is string => !!x))];
    setLinked({ osNumbers: nums, osItems: rows.length, free: (free.data ?? []).length });
  }

  async function confirm() {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-job', {
        body: { job_id: job.id, reason: fullReason, cancelled_by: 'workshop' },
      });
      if (error || data?.error) {
        setError(data?.error ?? error?.message ?? 'Erro ao cancelar');
        setBusy(false);
        return;
      }
      // O banco já devolveu os serviços para a pilha; "equipe" tira da pilha e devolve para a loja
      if (dest === 'equipe') await backToTeam();
      if (direct && dest === 'pilha') await saveToStack();
      setBusy(false);
      setOpen(false);
      onCancelled?.();
    } catch (e: any) {
      setError(e?.message ?? 'Erro de conexão');
      setBusy(false);
    }
  }

  /** Serviços da OS voltam a ser da equipe da loja; avulsos saem da pilha */
  async function backToTeam() {
    const { data: items } = await supabase.from('service_order_items')
      .update({ executor: null, workshop_mechanic_id: null, stacked_at: null })
      .eq('last_platform_job_id', job.id).eq('workshop_id', job.workshop_id)
      .select('service_order_id');
    const osIds = [...new Set(((items ?? []) as { service_order_id: string }[]).map(i => i.service_order_id))];
    if (osIds.length) {
      await supabase.from('service_orders').update({ executor: null })
        .in('id', osIds).eq('workshop_id', job.workshop_id).eq('executor', 'platform');
    }
    await supabase.from('stacked_services').update({ removed_at: new Date().toISOString() })
      .eq('last_job_id', job.id).eq('workshop_id', job.workshop_id).is('job_id', null);
  }

  /** Demanda direta vira um empilhado avulso: mesmo serviço, carro e valor, sem digitar de novo */
  async function saveToStack() {
    let description = (job.description ?? '').trim();
    const v = description.match(/\n*Ve[ií]culo:\s*(.+)$/i);
    const vehicle = v ? v[1].trim() : null;
    if (v) description = description.slice(0, v.index).trim();
    let title = job.title.trim();
    const model = vehicle?.split('·')[0].trim();
    if (model && title.toLowerCase().endsWith(` — ${model.toLowerCase()}`)) title = title.slice(0, -(model.length + 3)).trim();
    if (description === title) description = '';
    const { data: ch } = await supabase.from('job_customer_charges').select('amount').eq('job_id', job.id).maybeSingle();
    const { error } = await supabase.from('stacked_services').insert({
      workshop_id: job.workshop_id,
      title, description, vehicle,
      total: Math.round((job.price_per_hour ?? 0) * (job.max_hours ?? 1) * 100) / 100,
      hours: job.pricing === 'fixed' ? (job.estimated_hours ?? null) : (job.max_hours ?? null),
      customer_charge: ch?.amount ?? null,
      last_job_id: job.id,
    });
    if (error) toast.error('O anúncio foi cancelado, mas não deu para guardar nos Empilhados: ' + error.message);
  }

  function openModal(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
    setReasonKey('');
    setReason('');
    setDest('pilha');
    setLinked(null);
    setError(null);
    loadLinked();
  }

  const feeChip = cancellation.fee > 0 ? (
    <span className="ml-1 inline-flex items-center gap-1 bg-alert-500/15 text-alert-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">
      ⚠️ multa R$ {formatBRL(cancellation.fee)}
    </span>
  ) : cancellation.scenario === 'late_arrival' ? (
    <span className="ml-1 inline-flex items-center gap-1 bg-signal-500/15 text-signal-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">
      ✓ sem multa
    </span>
  ) : null;

  const trigger = variant === 'button' ? (
    <button onClick={openModal}
      className={`btn-ghost text-xs border border-alert-200 text-alert-700 hover:bg-alert-500/5 ${className}`}>
      🚫 {isAd ? 'Cancelar anúncio' : 'Cancelar demanda'}{feeChip}
    </button>
  ) : (
    <button onClick={openModal}
      className={`text-xs text-steel-400 hover:text-alert-600 underline-offset-2 hover:underline ${className}`}>
      {isAd ? 'Cancelar anúncio' : 'Cancelar demanda'}{feeChip}
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
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-start gap-3">
              <span className="text-3xl shrink-0">🚫</span>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-steel-900">{cancellation.title}</h3>
                <p className="text-sm text-steel-600 mt-1 leading-relaxed">{cancellation.message}</p>
                <p className="text-xs text-steel-500 mt-2 truncate"><strong>Demanda:</strong> {job.title}</p>
              </div>
            </div>

            {cancellation.fee > 0 && (
              <div className="bg-pending-500/10 border border-pending-300 rounded-xl px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-steel-700">Valor original</span>
                  <span className="font-semibold">R$ {formatBRL((((job.price_per_hour ?? 0) * (job.max_hours ?? 1))))}</span>
                </div>
                <div className="flex items-center justify-between text-alert-700 font-semibold mt-1">
                  <span>Multa (30%)</span>
                  <span>− R$ {formatBRL(cancellation.fee)}</span>
                </div>
                {cancellation.refund > 0 && (
                  <div className="flex items-center justify-between text-signal-700 font-bold mt-2 pt-2 border-t border-pending-300">
                    <span>Você recebe (estorno)</span>
                    <span>R$ {formatBRL(cancellation.refund)}</span>
                  </div>
                )}
              </div>
            )}

            {/* A OS não é cancelada: só a publicação para os mecânicos */}
            {hasLinked && (
              <div className="rounded-xl bg-signal-50 border border-signal-200 px-3 py-2.5 text-sm text-signal-900">
                {linked.osNumbers.length > 0
                  ? <>✅ {linked.osNumbers.length === 1 ? `A OS nº ${linked.osNumbers[0]} continua aberta` : `As OS nº ${linked.osNumbers.join(', ')} continuam abertas`}. Só a publicação para os mecânicos é cancelada.</>
                  : <>✅ Os serviços não se perdem: só a publicação para os mecânicos é cancelada.</>}
              </div>
            )}

            {/* Demanda direta: guardar nos Empilhados para juntar com outros ou publicar de novo depois */}
            {direct && (
              <div>
                <div className="text-xs font-semibold text-steel-500 uppercase tracking-wider mb-1.5">E o serviço?</div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['pilha', '📚 Guardar nos Empilhados', 'publicar de novo depois'],
                    ['nada', '🗑️ Só cancelar', 'não vou precisar'],
                  ] as const).map(([k, l, d]) => (
                    <button key={k} type="button" onClick={() => setDest(k)} disabled={busy}
                      className={`min-h-[60px] rounded-xl border-2 px-2.5 py-2 text-left transition ${dest === k ? 'border-brand-500 bg-brand-50' : 'border-steel-200'}`}>
                      <span className="block text-sm font-semibold text-steel-900 leading-tight">{l}</span>
                      <span className="block text-[11px] text-steel-600">{d}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Ninguém aceitou? Antes de cancelar, aumentar o valor costuma resolver */}
            {isAd && onEdit && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-50 border border-brand-200 px-3 py-2.5">
                <p className="text-xs text-brand-900 leading-snug">💡 Ninguém aceitou? Tente <strong>aumentar o valor</strong> antes de cancelar.</p>
                <button type="button" onClick={() => { setOpen(false); onEdit(); }}
                  className="shrink-0 h-9 px-3 rounded-lg bg-brand-500 text-white text-xs font-bold">Editar valor</button>
              </div>
            )}

            {/* Para onde voltam os serviços */}
            {hasLinked && (
              <div>
                <div className="text-xs font-semibold text-steel-500 uppercase tracking-wider mb-1.5">E os serviços?</div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['pilha', '📚 Voltar para Empilhados', 'publicar de novo depois'],
                    ['equipe', '👷 Devolver para a equipe', 'a loja faz o serviço'],
                  ] as const).map(([k, l, d]) => (
                    <button key={k} type="button" onClick={() => setDest(k)} disabled={busy}
                      className={`min-h-[60px] rounded-xl border-2 px-2.5 py-2 text-left transition ${dest === k ? 'border-brand-500 bg-brand-50' : 'border-steel-200'}`}>
                      <span className="block text-sm font-semibold text-steel-900 leading-tight">{l}</span>
                      <span className="block text-[11px] text-steel-600">{d}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-steel-500 uppercase tracking-wider mb-1.5 block">
                Por que está cancelando? *
              </label>
              <div className="flex flex-wrap gap-1.5">
                {REASONS.map(r => (
                  <button key={r} type="button" disabled={busy}
                    onClick={() => {
                      setReasonKey(r);
                      if (r === 'Vou fazer com a equipe') setDest(direct ? 'nada' : 'equipe');
                      else if (direct && r === 'Cliente desistiu') setDest('nada');
                    }}
                    className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition ${reasonKey === r ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-700 border-steel-200 hover:border-steel-300'}`}>
                    {r}
                  </button>
                ))}
              </div>
              {reasonKey && (
                <textarea
                  className="input text-sm resize-none mt-2"
                  rows={2}
                  placeholder={reasonKey === 'Outro' ? 'Conte o motivo' : 'Algum detalhe? (opcional)'}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  disabled={busy}
                />
              )}
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
                disabled={busy || !canConfirm}
                className="btn-ghost flex-1 border border-alert-500 text-alert-700 disabled:opacity-50"
              >
                {busy ? 'Cancelando…' : isAd ? 'Cancelar anúncio' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
