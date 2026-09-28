import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { fmtBRL, fmtDur } from '@/components/os/osHelpers';
import { pausesByReason, productivity, type PanelMechanic, type PanelOs } from '@/lib/workshopMetrics';
import PeriodPicker, { usePeriod } from '@/components/PeriodPicker';

/** Produtividade e comissões da equipe + tempo parado (veio do Painel para a área da Equipe) */
export default function TeamCommissions({ workshopId }: { workshopId: string }) {
  const period = usePeriod('comissoes-periodo', 'month');
  const [os, setOs] = useState<PanelOs[]>([]);
  const [mechs, setMechs] = useState<PanelMechanic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [o, m] = await Promise.all([
        fetchAll((a, b) => supabase.from('service_orders')
          .select('id, number, title, status, quote_status, price, parts_cost, labor_cost, created_at, started_at, completed_at, estimated_hours, workshop_mechanic_id, customer_id, customer:customers(id, full_name, created_at), vehicle:vehicles(make, model, plate), pauses:service_order_pauses(started_at, ended_at, reason)')
          .eq('workshop_id', workshopId).order('id').range(a, b)),
        supabase.from('workshop_mechanics').select('id, name, commission_percent, active').eq('workshop_id', workshopId),
      ]);
      if (!alive) return;
      setOs(o.data as unknown as PanelOs[]);
      setMechs((m.data as PanelMechanic[]) ?? []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [workshopId]);

  const team = useMemo(() => productivity(os, mechs, period.range), [os, mechs, period.range]);
  const pauses = useMemo(() => pausesByReason(os, period.range), [os, period.range]);
  const total = team.reduce((a, r) => a + r.commission, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-steel-500">{period.label}</div>
        <PeriodPicker period={period} />
      </div>

      {loading ? <div className="card h-40 animate-pulse" /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="card !bg-steel-900 text-white">
              <div className="text-[10px] font-bold uppercase tracking-widest text-steel-400">Comissões a pagar</div>
              <div className="text-2xl lg:text-3xl font-bold font-display mt-1">{fmtBRL(total)}</div>
              <div className="text-xs text-steel-400 mt-1">sobre a mão de obra das OS concluídas</div>
            </div>
            <div className="card">
              <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">OS concluídas</div>
              <div className="text-2xl lg:text-3xl font-bold font-display mt-1">{team.reduce((a, r) => a + r.count, 0)}</div>
            </div>
            <div className="card">
              <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">Horas trabalhadas</div>
              <div className="text-2xl lg:text-3xl font-bold font-display mt-1">{fmtDur(team.reduce((a, r) => a + r.workedMin, 0))}</div>
              <div className="text-xs text-steel-400 mt-1">sem contar as pausas</div>
            </div>
          </div>

          <div className="card !p-0 overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">👷 Produtividade e comissões</div>
              <p className="text-xs text-steel-400">OS concluídas no período. Tempo trabalhado já desconta as pausas.</p>
            </div>
            {team.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-steel-400">Nenhuma OS concluída no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-steel-50 text-[10px] uppercase tracking-wider text-steel-500">
                    <tr>
                      <th className="text-left px-5 py-2">Mecânico</th>
                      <th className="text-right px-3 py-2">OS</th>
                      <th className="text-right px-3 py-2">Horas trabalhadas</th>
                      <th className="text-right px-3 py-2">Tempo médio</th>
                      <th className="text-right px-3 py-2">No prazo</th>
                      <th className="text-right px-3 py-2">Faturou</th>
                      <th className="text-right px-3 py-2">Mão de obra</th>
                      <th className="text-right px-5 py-2">Comissão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {team.map(r => (
                      <tr key={r.id}>
                        <td className="px-5 py-2.5 font-semibold">{r.name}</td>
                        <td className="px-3 py-2.5 text-right">{r.count}</td>
                        <td className="px-3 py-2.5 text-right">{r.timedCount ? fmtDur(r.workedMin) : '—'}</td>
                        <td className="px-3 py-2.5 text-right">{r.timedCount ? fmtDur(Math.round(r.workedMin / r.timedCount)) : '—'}</td>
                        <td className="px-3 py-2.5 text-right">{r.withEstimate ? `${Math.round((r.onTime / r.withEstimate) * 100)}%` : '—'}</td>
                        <td className="px-3 py-2.5 text-right">{fmtBRL(r.revenue)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtBRL(r.labor)}</td>
                        <td className="px-5 py-2.5 text-right font-bold">
                          {r.id === 'none' ? '—' : fmtBRL(r.commission)}
                          {r.id !== 'none' && <div className="text-[10px] font-normal text-steel-400">{r.commissionPercent}% da mão de obra</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-5 py-3 bg-steel-50 text-xs text-steel-500 border-t border-steel-100">
              A % de comissão de cada mecânico é definida em <Link to="/oficina/equipe" className="text-brand-600 font-semibold">👷 Colaboradores</Link> (ficha de cada um).
            </div>
          </div>

          <div className="card">
            <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3">⏸ Tempo parado por motivo</div>
            {pauses.length === 0 ? <p className="text-sm text-steel-400">Nenhuma pausa no período.</p> : (
              <ol className="space-y-2">
                {pauses.map((p, i) => (
                  <li key={p.reason} className="flex justify-between gap-2 text-sm">
                    <span><span className="text-steel-400 mr-1">{i + 1}.</span>{p.reason}</span>
                    <strong>{fmtDur(p.minutes)}</strong>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}
