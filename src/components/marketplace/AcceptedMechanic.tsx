import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { MechanicReviews } from '@/components/MechanicReviews';
import { ACCEPT_TOLERANCE_MS, acceptedAt } from '@/lib/arrivalDeadline';
import { IconStar } from '@/components/mecanico/icons';
import type { Job } from '@/types/database';

/** Quem aceitou a demanda, como a oficina vê no card */
export type AcceptedMechanic = { name: string; avatar: string | null; rating: number; total_jobs: number };

/**
 * Janela de troca: nos 5 min após o aceite a oficina pode trocar o mecânico (a demanda volta a
 * ficar aberta) ou confirmar antes. Convite direto não entra: a oficina já escolheu esse mecânico.
 * O servidor (workshop_swap_mechanic) confere a mesma regra.
 */
export function swapWindowEndsAt(j: Job): number | null {
  if (j.status !== 'assigned' || !j.mechanic_id || j.arrived_at || j.pix_paid_at) return null;
  if (j.audience === 'invite' || j.workshop_approved_at) return null;
  const end = acceptedAt(j) + ACCEPT_TOLERANCE_MS;
  return end > Date.now() ? end : null;
}

export function useCountdown(end: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!end) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [end]);
  const left = end ? Math.max(0, Math.ceil((end - now) / 1000)) : 0;
  return { left, label: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` };
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');

export function AcceptedMechanicRow({ j, m, onChanged }: { j: Job; m: AcceptedMechanic; onChanged: () => void }) {
  const end = swapWindowEndsAt(j);
  const { left, label } = useCountdown(end);
  const canSwap = !!end && left > 0;
  const [reviews, setReviews] = useState(false);
  const [busy, setBusy] = useState(false);

  async function swap() {
    if (!confirm(`Trocar ${m.name.split(' ')[0]}? A demanda volta a ficar aberta para os outros mecânicos, sem multa.`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('workshop_swap_mechanic', { p_job_id: j.id });
    setBusy(false);
    const err = error?.message ?? (data as { error?: string } | null)?.error;
    if (err) { toast.error(err); onChanged(); return; }
    toast.success('Mecânico trocado. A demanda voltou para os outros mecânicos.');
    onChanged();
  }

  async function approve() {
    setBusy(true);
    const { error } = await supabase.from('jobs').update({ workshop_approved_at: new Date().toISOString() })
      .eq('id', j.id).eq('status', 'assigned').eq('mechanic_id', j.mechanic_id!);
    setBusy(false);
    if (error) { toast.error('Não foi possível confirmar: ' + error.message); return; }
    toast.success(`${m.name.split(' ')[0]} confirmado. Ele já pode sair.`);
    onChanged();
  }

  return (
    <div className="mt-3 rounded-lg bg-steel-50 border border-steel-200 p-2.5">
      <div className="flex items-center gap-2.5">
        {m.avatar
          ? <img src={m.avatar} alt="" loading="lazy" className="h-10 w-10 rounded-full object-cover bg-steel-100 shrink-0" />
          : <span className="h-10 w-10 rounded-full bg-brand-50 grid place-items-center text-sm font-bold text-brand-700 shrink-0">{initials(m.name)}</span>}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-steel-900 truncate">{m.name}</div>
          <div className="text-xs text-steel-600 flex items-center gap-1">
            {m.rating > 0
              ? <><IconStar filled className="w-3 h-3 text-amber-500" />{m.rating.toFixed(1).replace('.', ',')}</>
              : 'Novo na plataforma'}
            <span aria-hidden>·</span>{m.total_jobs} {m.total_jobs === 1 ? 'serviço' : 'serviços'}
          </div>
        </div>
        <button type="button" onClick={() => setReviews(r => !r)} aria-expanded={reviews}
          className="shrink-0 min-h-[36px] px-2 text-xs font-semibold text-brand-600">
          {reviews ? 'Ocultar' : 'Avaliações'}
        </button>
      </div>
      {reviews && <div className="mt-2 pt-2 border-t border-steel-200"><MechanicReviews mechanicId={j.mechanic_id!} /></div>}

      {canSwap && (
        <div className="mt-2.5 pt-2.5 border-t border-steel-200">
          <div className="text-xs text-steel-600">
            Você pode trocar sem custo por <strong className="tabular-nums text-steel-900">{label}</strong>
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={approve} disabled={busy}
              className="flex-1 h-10 rounded-lg bg-signal-500 text-white text-xs font-bold active:scale-[0.98] disabled:opacity-50">
              Confirmar mecânico
            </button>
            <button type="button" onClick={swap} disabled={busy}
              className="flex-1 h-10 rounded-lg border border-steel-300 bg-white text-steel-800 text-xs font-bold active:scale-[0.98] disabled:opacity-50">
              Trocar mecânico
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
