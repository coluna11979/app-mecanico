import { useEffect, useMemo, useState } from 'react';
import { brl } from '@/lib/cash';
import { dayKey, loadRangeData, type HalfData } from '@/lib/commissionDaily';
import { buildTeamCostRange, fmtHours, loadTeamCostInputs } from '@/lib/teamCost';

const MAX_DAYS = 93;
const br = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const brLong = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const brShort = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

type Inputs = Awaited<ReturnType<typeof loadTeamCostInputs>>;

/**
 * Custo da equipe de mecânicos no período escolhido no topo da Visão financeira, pelas horas trabalhadas.
 * Um dia = o dia; vários dias = a soma deles (dias futuros ficam de fora). Gerencial, só para o gestor.
 * Não entra no Resultado do período (que já conta salários/comissões pagos): ver lib/teamCost.ts.
 */
export default function TeamCostDay({ wid, range }: { wid: string; range: { from: Date; to: Date } }) {
  const todayKey = dayKey(new Date());
  // Dias do período (até hoje)
  const days = useMemo(() => {
    const out: string[] = [];
    for (const d = new Date(range.from); d < range.to && out.length <= MAX_DAYS; d.setDate(d.getDate() + 1)) {
      const k = dayKey(d);
      if (k <= todayKey) out.push(k);
    }
    return out;
  }, [range.from.getTime(), range.to.getTime(), todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const tooLong = days.length > MAX_DAYS;
  const first = days[0], last = days[days.length - 1];
  const key = `${first}|${last}`;

  const [data, setData] = useState<{ key: string; hd: HalfData; inp: Inputs } | null>(null);
  useEffect(() => {
    if (!first || tooLong) return;
    let alive = true;
    const from = new Date(`${first}T00:00:00`).toISOString();
    const to = new Date(new Date(`${last}T00:00:00`).getTime() + 86400000).toISOString();
    Promise.all([loadRangeData(wid, from, to), loadTeamCostInputs(wid, first, last)])
      .then(([hd, inp]) => { if (alive) setData({ key, hd, inp }); });
    return () => { alive = false; };
  }, [wid, key, first, last, tooLong]);

  const cost = useMemo(() => (data && data.key === key ? buildTeamCostRange(days, data.inp, data.hd) : null), [data, key, days]);

  const single = days.length === 1;
  const title = single ? brLong(first) : first ? `${br(first)} a ${br(last)} · ${days.length} dias` : '';
  const pctOfRevenue = cost && cost.revenue > 0 ? (cost.total / cost.revenue) * 100 : null;
  const perHour = cost && cost.workedMin > 0 ? cost.total / (cost.workedMin / 60) : null;
  const use = cost && cost.productiveMin != null && cost.workedMin > 0 ? (cost.productiveMin / cost.workedMin) * 100 : null;
  const maxDay = Math.max(1, ...(cost?.days ?? []).map(d => d.total));

  return (
    <div className="card">
      <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-1">👷 Custo da equipe {single ? 'no dia' : 'no período'}</div>
      <p className="text-[11px] text-steel-400 mb-2">Só mecânicos, pelas horas trabalhadas · segue o período escolhido no topo · informativo (não entra no Resultado)</p>
      {title && <div className="text-sm font-semibold capitalize mb-3">{title}</div>}

      {tooLong ? (
        <p className="text-sm text-steel-500 py-6 text-center">Escolha um período de até {MAX_DAYS} dias para ver o custo da equipe.</p>
      ) : !first ? (
        <p className="text-sm text-steel-500 py-6 text-center">O período escolhido ainda não começou.</p>
      ) : !cost ? (
        <div className="h-32 bg-steel-50 rounded-xl animate-pulse" />
      ) : cost.people.length === 0 ? (
        <p className="text-sm text-steel-400 py-6 text-center">Nenhum mecânico cadastrado. Na ficha da Equipe, coloque a função “Mecânico”.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-steel-900 text-white p-4 col-span-2 sm:col-span-1">
              <div className="text-[11px] text-steel-400">Custo da equipe {single ? 'no dia' : 'no período'}</div>
              <div className="text-2xl font-bold font-display mt-0.5">{brl(cost.total)}</div>
              <div className="text-[11px] text-steel-300 mt-0.5">salários {brl(cost.salaryCost)} + comissões {brl(cost.commission)}</div>
            </div>
            <div className="rounded-2xl border border-steel-200 p-4 col-span-2 sm:col-span-1">
              <div className="text-[11px] text-steel-500">Horas trabalhadas</div>
              <div className="text-2xl font-bold font-display mt-0.5">{fmtHours(cost.workedMin)}</div>
              <div className="text-[11px] text-steel-500 mt-0.5">
                {cost.productiveMin != null
                  ? <>produtivas em OS: <strong>{fmtHours(cost.productiveMin)}</strong>{use != null && <> · aproveitamento <strong>{Math.round(use)}%</strong></>}</>
                  : 'sem relógio de OS no período'}
              </div>
            </div>
            <div className="rounded-2xl border border-steel-200 p-4">
              <div className="text-[11px] text-steel-500">Custo por hora trabalhada</div>
              <div className="text-xl font-bold mt-0.5">{perHour != null ? brl(perHour) : '—'}</div>
            </div>
            <div className="rounded-2xl border border-steel-200 p-4">
              <div className="text-[11px] text-steel-500">% do faturado</div>
              <div className="text-xl font-bold mt-0.5">{pctOfRevenue != null ? `${pctOfRevenue.toFixed(0)}%` : '—'}</div>
              <div className="text-[11px] text-steel-400">faturado {brl(cost.revenue)}</div>
            </div>
          </div>

          {cost.commission === 0 && (
            <p className="text-xs bg-steel-50 border border-steel-200 text-steel-600 rounded-xl px-3 py-2 mt-3">
              Nenhum serviço finalizado {single ? 'neste dia' : 'neste período'}, então a comissão é R$ 0,00 (ela conta no dia em que o serviço termina).
            </p>
          )}

          <ul className="mt-4 divide-y divide-steel-100">
            {cost.people.map(p => (
              <li key={p.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{p.name}
                      {p.absent && <span className="badge bg-pending-100 text-pending-800 ml-2">afastado</span>}
                    </div>
                    <div className="text-xs text-steel-500 mt-0.5">
                      {p.hasSchedule
                        ? <>{fmtHours(p.workedMin)} trabalhadas{single && p.scheduledMin > 0 && p.workedMin !== p.scheduledMin && !p.absent ? ` de ${fmtHours(p.scheduledMin)}` : ''}
                          {p.productiveMin != null && <> · {fmtHours(p.productiveMin)} em OS</>}</>
                        : <span className="text-pending-800">sem jornada cadastrada</span>}
                    </div>
                    <div className="text-[11px] text-steel-400 mt-0.5">
                      {p.hasSalary && p.hasSchedule ? `salário ${brl(p.salaryCost)}` : p.hasSalary ? 'salário não entrou na conta' : <span className="text-pending-800">sem salário cadastrado</span>}
                      {' · '}comissão <strong className={p.commission > 0 ? 'text-signal-700' : ''}>{brl(p.commission)}</strong>
                      {p.hourly != null && <> · {brl(p.hourly)}/h</>}
                    </div>
                  </div>
                  <div className="text-base font-bold tabular-nums shrink-0">{brl(p.total)}</div>
                </div>
              </li>
            ))}
            <li className="py-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm bg-steel-50 -mx-2 px-2 rounded-lg">
              <span className="font-semibold">Total {single ? 'do dia' : 'do período'}</span>
              <span className="text-xs text-steel-500">salários {brl(cost.salaryCost)} · comissões <strong className="text-signal-700">{brl(cost.commission)}</strong></span>
              <strong className="tabular-nums">{brl(cost.total)}</strong>
            </li>
          </ul>

          {!single && cost.days.length > 1 && (
            <div className="mt-4">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-2">Dia a dia</div>
              <ul className="space-y-1">
                {cost.days.filter(d => d.workedMin > 0 || d.total > 0).map(d => (
                  <li key={d.day} className="px-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="capitalize text-steel-700">{brShort(d.day)}
                        <span className="text-steel-400 text-xs"> · {fmtHours(d.workedMin)}{d.commission > 0 ? ` · comissão ${brl(d.commission)}` : ''}</span></span>
                      <strong className="tabular-nums">{brl(d.total)}</strong>
                    </div>
                    <div className="h-1.5 rounded-full bg-steel-100 mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(d.total / maxDay) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {cost.missing.length > 0 && (
            <p className="text-xs bg-pending-50 border border-pending-200 text-pending-900 rounded-xl px-3 py-2 mt-3">
              ⚠️ Custo incompleto: {cost.missing.map(m => `${m.name} (${m.why})`).join(', ')}. Complete na ficha da Equipe.
            </p>
          )}
          <p className="text-[11px] text-steel-400 leading-relaxed mt-3">
            Custo por hora = salário ÷ horas contratadas do mês. Horas trabalhadas = jornada de cada dia (hoje, só o que já passou), sem folga nem afastamento;
            afastado não trabalha, mas o salário é pago. Comissão = a da aba “Por dia” das Comissões (conta no dia em que o serviço termina). Sem encargos (13º, férias, FGTS).
          </p>
        </>
      )}
    </div>
  );
}
