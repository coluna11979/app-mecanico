import { useEffect, useMemo, useState } from 'react';
import { brl } from '@/lib/cash';
import { dayKey, halfOfDay, loadHalfData, type HalfData } from '@/lib/commissionDaily';
import { buildTeamCost, fmtHours, loadTeamCostInputs } from '@/lib/teamCost';

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};
const longDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

type Inputs = Awaited<ReturnType<typeof loadTeamCostInputs>>;

/**
 * Custo da equipe de mecânicos no dia, pelas horas trabalhadas (jornada) — gerencial, só para o gestor.
 * Não entra no Resultado do período (que já conta salários/comissões pagos): ver lib/teamCost.ts.
 */
export default function TeamCostDay({ wid }: { wid: string }) {
  const today = dayKey(new Date());
  const [day, setDay] = useState(today);
  const half = halfOfDay(day);
  const halfKey = `${half.competence}-${half.half}`;
  const [hd, setHd] = useState<{ key: string; d: HalfData } | null>(null);
  const [inp, setInp] = useState<{ day: string; d: Inputs } | null>(null);

  // Comissão e faturamento: a quinzena inteira de uma vez (trocar de dia dentro dela não consulta de novo)
  useEffect(() => {
    let alive = true;
    if (hd?.key === halfKey) return;
    loadHalfData(wid, half.competence, half.half).then(d => { if (alive) setHd({ key: halfKey, d }); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wid, halfKey]);
  // Jornada, salário, afastamentos e relógio: do dia
  useEffect(() => {
    let alive = true;
    loadTeamCostInputs(wid, day).then(d => { if (alive) setInp({ day, d }); });
    return () => { alive = false; };
  }, [wid, day]);

  const cost = useMemo(() => {
    if (!inp || inp.day !== day || !hd || hd.key !== halfKey) return null;
    return buildTeamCost(day, inp.d, hd.d);
  }, [inp, hd, day, halfKey]);

  const pctOfRevenue = cost && cost.revenue > 0 ? (cost.total / cost.revenue) * 100 : null;
  const perHour = cost && cost.workedMin > 0 ? cost.total / (cost.workedMin / 60) : null;
  const use = cost && cost.productiveMin != null && cost.workedMin > 0 ? (cost.productiveMin / cost.workedMin) * 100 : null;

  return (
    <div className="card">
      <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-1">👷 Custo da equipe no dia</div>
      <p className="text-[11px] text-steel-400 mb-3">Só mecânicos, pelas horas trabalhadas · informativo (não entra no Resultado)</p>

      <div className="flex flex-wrap items-center gap-2 mb-1">
        {([['Hoje', today], ['Ontem', addDays(today, -1)]] as const).map(([l, v]) => (
          <button key={l} onClick={() => setDay(v)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${day === v ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200 hover:border-steel-300'}`}>{l}</button>
        ))}
        <div className="flex items-center gap-1 ml-auto">
          <button className="h-9 w-9 rounded-xl border border-steel-200 bg-white hover:bg-steel-50" onClick={() => setDay(addDays(day, -1))} aria-label="Dia anterior">‹</button>
          <input type="date" className="input !py-1.5 !w-auto text-sm" value={day} onChange={e => e.target.value && setDay(e.target.value)} />
          <button className="h-9 w-9 rounded-xl border border-steel-200 bg-white hover:bg-steel-50" onClick={() => setDay(addDays(day, 1))} aria-label="Próximo dia">›</button>
        </div>
      </div>
      <div className="text-sm font-semibold capitalize mb-3">{longDay(day)}</div>

      {!cost ? (
        <div className="h-32 bg-steel-50 rounded-xl animate-pulse" />
      ) : cost.people.length === 0 ? (
        <p className="text-sm text-steel-400 py-6 text-center">Nenhum mecânico cadastrado. Na ficha da Equipe, coloque a função “Mecânico”.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-steel-900 text-white p-4 col-span-2 sm:col-span-1">
              <div className="text-[11px] text-steel-400">Custo da equipe no dia</div>
              <div className="text-2xl font-bold font-display mt-0.5">{brl(cost.total)}</div>
              <div className="text-[11px] text-steel-300 mt-0.5">salários {brl(cost.salaryCost)} + comissões {brl(cost.commission)}</div>
            </div>
            <div className="rounded-2xl border border-steel-200 p-4 col-span-2 sm:col-span-1">
              <div className="text-[11px] text-steel-500">Horas trabalhadas</div>
              <div className="text-2xl font-bold font-display mt-0.5">{fmtHours(cost.workedMin)}</div>
              <div className="text-[11px] text-steel-500 mt-0.5">
                {cost.productiveMin != null
                  ? <>produtivas em OS: <strong>{fmtHours(cost.productiveMin)}</strong>{use != null && <> · aproveitamento <strong>{Math.round(use)}%</strong></>}</>
                  : 'sem relógio de OS neste dia'}
              </div>
            </div>
            <div className="rounded-2xl border border-steel-200 p-4">
              <div className="text-[11px] text-steel-500">Custo por hora trabalhada</div>
              <div className="text-xl font-bold mt-0.5">{perHour != null ? brl(perHour) : '—'}</div>
            </div>
            <div className="rounded-2xl border border-steel-200 p-4">
              <div className="text-[11px] text-steel-500">% do faturado no dia</div>
              <div className="text-xl font-bold mt-0.5">{pctOfRevenue != null ? `${pctOfRevenue.toFixed(0)}%` : '—'}</div>
              <div className="text-[11px] text-steel-400">faturado {brl(cost.revenue)}</div>
            </div>
          </div>

          <ul className="mt-4 divide-y divide-steel-100">
            {cost.people.map(p => (
              <li key={p.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{p.name}
                      {p.absent && <span className="badge bg-pending-100 text-pending-800 ml-2">afastado</span>}
                      {!p.absent && p.hasSchedule && p.scheduledMin === 0 && <span className="badge bg-steel-100 text-steel-500 ml-2">folga</span>}
                    </div>
                    <div className="text-xs text-steel-500 mt-0.5">
                      {p.hasSchedule
                        ? <>{fmtHours(p.workedMin)} trabalhadas{p.scheduledMin > 0 && p.workedMin !== p.scheduledMin && !p.absent ? ` de ${fmtHours(p.scheduledMin)}` : ''}
                          {p.productiveMin != null && <> · {fmtHours(p.productiveMin)} em OS</>}</>
                        : <span className="text-pending-800">sem jornada cadastrada</span>}
                    </div>
                    <div className="text-[11px] text-steel-400 mt-0.5">
                      {p.hasSalary && p.hasSchedule ? `salário ${brl(p.salaryCost)}` : p.hasSalary ? 'salário não entrou na conta' : <span className="text-pending-800">sem salário cadastrado</span>}
                      {' · '}comissão {brl(p.commission)}
                      {p.hourly != null && <> · {brl(p.hourly)}/h</>}
                    </div>
                  </div>
                  <div className="text-base font-bold tabular-nums shrink-0">{brl(p.total)}</div>
                </div>
              </li>
            ))}
          </ul>

          {cost.missing.length > 0 && (
            <p className="text-xs bg-pending-50 border border-pending-200 text-pending-900 rounded-xl px-3 py-2 mt-3">
              ⚠️ Custo incompleto: {cost.missing.map(m => `${m.name} (${m.why})`).join(', ')}. Complete na ficha da Equipe.
            </p>
          )}
          <p className="text-[11px] text-steel-400 leading-relaxed mt-3">
            Custo por hora = salário ÷ horas contratadas do mês. Horas trabalhadas = jornada do dia (hoje, só o que já passou), sem folga nem afastamento;
            afastado não trabalha, mas o salário é pago. Comissão do dia = a da aba “Por dia” das Comissões. Sem encargos (13º, férias, FGTS).
          </p>
        </>
      )}
    </div>
  );
}
