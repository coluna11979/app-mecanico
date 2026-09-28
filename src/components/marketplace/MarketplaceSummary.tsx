import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { fmtBRL, fmtDur } from '@/components/os/osHelpers';
import { marketplaceOf, type PanelJob } from '@/lib/workshopMetrics';
import { arrivalDeadline } from '@/lib/arrivalDeadline';
import PeriodPicker, { usePeriod } from '@/components/PeriodPicker';

/** Resumo das demandas contratadas pela plataforma (veio do Painel para Demandas) */
export default function MarketplaceSummary({ workshopId }: { workshopId: string }) {
  const period = usePeriod('plataforma-periodo', 'month');
  const [jobs, setJobs] = useState<PanelJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('plataforma-resumo') === 'aberto'; } catch { return false; }
  });

  useEffect(() => { try { localStorage.setItem('plataforma-resumo', open ? 'aberto' : 'fechado'); } catch { /* ignore */ } }, [open]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await fetchAll((a, b) => supabase.from('jobs')
        .select('id, title, status, price, created_at, accepted_at, en_route_at, arrived_at, completed_at, cancelled_at, cancelled_by, cancellation_fee, cancellation_fee_paid_at, workshop_confirmed_at, mechanic_rating, scheduled_at, mechanic_id, mechanic:mechanics(id, profile:profiles(full_name))')
        .eq('workshop_id', workshopId).order('id').range(a, b));
      if (!alive) return;
      setJobs(data as unknown as PanelJob[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [workshopId]);

  const m = useMemo(() => marketplaceOf(jobs, period.range, j => arrivalDeadline(j)), [jobs, period.range]);

  if (loading || jobs.length === 0) return null;

  return (
    <div className="card mb-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setOpen(o => !o)} className="text-left">
          <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">{open ? '▾' : '▸'} 📊 Resumo das suas demandas</div>
          <p className="text-xs text-steel-400">
            {open ? period.label : `${fmtBRL(m.spent)} gastos · ${m.doneCount} concluídas no período`}
          </p>
        </button>
        {open && <PeriodPicker period={period} />}
      </div>

      {open && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <MiniStat label="Gasto no período" value={fmtBRL(m.spent)} sub={`${m.doneCount} demanda${m.doneCount === 1 ? '' : 's'} concluída${m.doneCount === 1 ? '' : 's'}`} />
            <MiniStat label="Aceite em média" value={m.avgAcceptMin != null ? fmtDur(m.avgAcceptMin) : '—'} sub="da publicação ao aceite" />
            <MiniStat label="Chegada em média" value={m.avgArrivalMin != null ? fmtDur(m.avgArrivalMin) : '—'}
              sub={m.onTimeRate != null ? `${Math.round(m.onTimeRate)}% dentro do prazo` : 'sem chegadas no período'} />
            <MiniStat label="Canceladas" value={String(m.cancelledCount)} sub={m.feesPaid > 0 ? `${fmtBRL(m.feesPaid)} em multas` : 'sem multas'} />
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div>
              {(m.pendingConfirm > 0 || m.pendingRating > 0 || m.pendingFees > 0) ? (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-steel-600 mb-1">Pendências</div>
                  {m.pendingConfirm > 0 && (
                    <div className="text-xs font-semibold text-brand-800 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
                      🔔 {m.pendingConfirm} serviço{m.pendingConfirm === 1 ? '' : 's'} aguardando sua confirmação — o mecânico só recebe depois dela
                    </div>
                  )}
                  {m.pendingRating > 0 && (
                    <div className="text-xs text-steel-700 bg-steel-50 rounded-lg px-3 py-2">
                      ⭐ {m.pendingRating} avaliação{m.pendingRating === 1 ? '' : 'ões'} pendente{m.pendingRating === 1 ? '' : 's'}
                    </div>
                  )}
                  {m.pendingFees > 0 && (
                    <div className="text-xs font-semibold text-alert-700 bg-alert-50 rounded-lg px-3 py-2">
                      ⚠️ {fmtBRL(m.pendingFees)} em multa de cancelamento pendente — bloqueia novas demandas
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-steel-400">Nenhuma pendência. ✓</p>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-steel-600 mb-2">Mecânicos que você mais contratou</div>
              {m.topMechanics.length === 0 ? (
                <p className="text-sm text-steel-400">Nenhuma demanda concluída no período.</p>
              ) : (
                <ol className="space-y-2">
                  {m.topMechanics.map((t, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate"><span className="text-steel-400 mr-1">{i + 1}.</span>{t.name}</span>
                      <span className="shrink-0 text-right">
                        <strong>{fmtBRL(t.spent)}</strong>
                        <span className="block text-[10px] text-steel-400">
                          {t.jobs} demanda{t.jobs === 1 ? '' : 's'}{t.avgRating != null ? ` · ★ ${t.avgRating.toFixed(1)}` : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
          <div className="text-[11px] text-steel-400 mt-3">
            As demandas em andamento aparecem logo abaixo. <Link to="/oficina/dashboard?nova=1" className="text-brand-600 hover:underline">＋ Chamar mecânico</Link>
          </div>
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-steel-50 rounded-xl px-3 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">{label}</div>
      <div className="text-xl font-bold font-display mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-steel-500 mt-0.5">{sub}</div>}
    </div>
  );
}
